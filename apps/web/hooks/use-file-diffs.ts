'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseDiff, placeholderFileFromMeta, type ParsedFileChange } from '@/lib/diff'
import type { DiffFileContents, DiffFileMeta } from '@/lib/types'

const AUTO_EXPAND_THRESHOLD = 3

export function useFileDiffs(sessionId: string, files: DiffFileMeta[]) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [autoExpandHandled, setAutoExpandHandled] = useState(false)
  const [loaded, setLoaded] = useState<Map<string, ParsedFileChange>>(() => new Map())
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set())
  const [contentsCache, setContentsCache] = useState<Map<string, DiffFileContents>>(() => new Map())
  const inflight = useRef(new Set<string>())
  const contentsInflight = useRef(new Set<string>())
  const lastMetaSignature = useRef(new Map<string, string>())

  const fetchFileDiff = useCallback(
    async (path: string): Promise<(DiffFileMeta & { patch: string }) | null> => {
      try {
        const response = await fetch(
          `/api/sessions/${sessionId}/diff?path=${encodeURIComponent(path)}`,
        )
        if (!response.ok) return null
        return (await response.json()) as DiffFileMeta & { patch: string }
      } catch {
        return null
      }
    },
    [sessionId],
  )

  const loadFileDiff = useCallback(
    async (path: string, silent = false) => {
      if (inflight.current.has(path)) return
      inflight.current.add(path)
      if (!silent) setLoadingPaths((previous) => new Set(previous).add(path))
      try {
        const diffFile = await fetchFileDiff(path)
        if (diffFile !== null) {
          const parsed = parseDiff(diffFile.patch)[0]
          const file: ParsedFileChange = parsed
            ? {
                ...parsed,
                path: diffFile.path,
                previousPath: diffFile.previousPath,
                status: diffFile.status,
                additions: diffFile.additions,
                deletions: diffFile.deletions,
              }
            : placeholderFileFromMeta(diffFile)
          setLoaded((previous) => new Map(previous).set(path, file))
        }
      } finally {
        inflight.current.delete(path)
        if (!silent) {
          setLoadingPaths((previous) => {
            const next = new Set(previous)
            next.delete(path)
            return next
          })
        }
      }
    },
    [fetchFileDiff],
  )

  const refreshFileDiff = useCallback(
    (path: string) => {
      void loadFileDiff(path, true)
    },
    [loadFileDiff],
  )

  const loadFileContents = useCallback(
    async (path: string) => {
      if (contentsInflight.current.has(path)) return
      contentsInflight.current.add(path)
      try {
        const response = await fetch(
          `/api/sessions/${sessionId}/diff?path=${encodeURIComponent(path)}&contents=1`,
        )
        if (!response.ok) return
        const contents = (await response.json()) as DiffFileMeta & {
          oldContent: string
          newContent: string
        }
        setContentsCache((previous) =>
          new Map(previous).set(path, {
            oldContent: contents.oldContent ?? '',
            newContent: contents.newContent ?? '',
            contentTooLarge: contents.contentTooLarge ?? false,
            binary: contents.binary ?? false,
          }),
        )
      } finally {
        contentsInflight.current.delete(path)
      }
    },
    [sessionId],
  )

  useEffect(() => {
    const signature = new Map(
      files.map((file) => [file.path, `${file.status}:${file.additions}:${file.deletions}`]),
    )
    const previousSignature = lastMetaSignature.current
    lastMetaSignature.current = signature
    setContentsCache((previous) => {
      let next: Map<string, DiffFileContents> | null = null
      for (const path of previous.keys()) {
        if (signature.get(path) !== previousSignature.get(path)) {
          if (!next) next = new Map(previous)
          next.delete(path)
        }
      }
      return next ?? previous
    })
    for (const path of expanded) {
      if (files.some((file) => file.path === path)) {
        refreshFileDiff(path)
      } else {
        setLoaded((previous) => {
          if (!previous.has(path)) return previous
          const next = new Map(previous)
          next.delete(path)
          return next
        })
      }
    }
  }, [files, expanded, refreshFileDiff])

  useEffect(() => {
    if (autoExpandHandled || files.length === 0) return
    if (files.length <= AUTO_EXPAND_THRESHOLD) {
      setExpanded(new Set(files.map((file) => file.path)))
      for (const file of files) void loadFileDiff(file.path)
    }
    setAutoExpandHandled(true)
  }, [files, autoExpandHandled, loadFileDiff])

  function toggleExpanded(path: string) {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return {
    expanded,
    loaded,
    loadingPaths,
    contentsCache,
    loadFileDiff,
    loadFileContents,
    toggleExpanded,
  }
}
