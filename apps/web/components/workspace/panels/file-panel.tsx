'use client'

import { useEffect, useMemo, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DiffViewerStats } from '@/components/ui/diff-viewer'
import { placeholderFileFromMeta, sumDiffTotals } from '@/lib/diff'
import { DiffFile } from '@/components/workspace/panels/diff-file'
import { ViewToggle, type DiffView } from '@/components/workspace/panels/view-toggle'
import { useFileDiffs } from '@/hooks/use-file-diffs'
import type { DiffFileMeta } from '@/lib/types'

export function FilePanel({ sessionId, files }: { sessionId: string; files: DiffFileMeta[] }) {
  const totals = useMemo(() => sumDiffTotals(files), [files])
  const [view, setView] = useState<DiffView>('unified')
  const [activeIndex, setActiveIndex] = useState(0)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const {
    expanded,
    loaded,
    loadingPaths,
    contentsCache,
    loadFileDiff,
    loadFileContents,
    toggleExpanded,
  } = useFileDiffs(sessionId, files)

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, files.length - 1)))
  }, [files.length])

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollElement,
    getItemKey: (index) => files[index]?.path ?? `index-${index}`,
    estimateSize: () => 49,
    overscan: 4,
  })

  function handleToggle(index: number, path: string) {
    setActiveIndex(index)
    const opening = !expanded.has(path)
    toggleExpanded(path)
    if (opening && !loaded.has(path)) void loadFileDiff(path)
  }

  function moveActiveFile(delta: 1 | -1) {
    setActiveIndex((index) => {
      const next = Math.min(Math.max(0, index + delta), Math.max(0, files.length - 1))
      virtualizer.scrollToIndex(next, { align: 'auto' })
      return next
    })
  }

  useHotkeys('n', () => moveActiveFile(1), { enabled: files.length > 0 }, [files])
  useHotkeys('p', () => moveActiveFile(-1), { enabled: files.length > 0 }, [files])

  if (files.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
        <div>
          <div className="mb-2 text-lg">No changes yet</div>
          <p className="text-sm">File diffs will appear here as the agent edits the repository.</p>
        </div>
      </div>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 pb-2 pl-3">
        <span className="shrink-0 font-mono text-xs text-muted-foreground" role="status">
          {totals.files} {totals.files === 1 ? 'file' : 'files'}
        </span>
        <DiffViewerStats additions={totals.additions} deletions={totals.deletions} />
        <ViewToggle view={view} onChange={setView} />
      </div>
      <ScrollArea viewportRef={setScrollElement} className="min-h-0 flex-1">
        <div
          role="list"
          aria-label="Changed files"
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualItems.map((virtualItem) => {
            const meta = files[virtualItem.index]
            if (meta === undefined) return null
            const loadedFile = loaded.get(meta.path)
            const file = loadedFile ?? placeholderFileFromMeta(meta)
            const loading = !loadedFile && loadingPaths.has(meta.path)
            return (
              <div
                key={virtualItem.key}
                role="listitem"
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <DiffFile
                  file={file}
                  view={view}
                  open={expanded.has(meta.path)}
                  active={virtualItem.index === activeIndex}
                  loading={loading}
                  binary={meta.binary ?? false}
                  contents={contentsCache.get(meta.path) ?? null}
                  onNeedContents={() => loadFileContents(meta.path)}
                  onToggle={() => handleToggle(virtualItem.index, meta.path)}
                />
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
