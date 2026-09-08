'use client'

import { useEffect, useState } from 'react'
import type { ContentGap } from '@/lib/diff'
import type { DiffFileContents } from '@/lib/types'

export function useExpandedGaps(
  contents: DiffFileContents | null,
  onNeedContents: () => void,
): { expandedGaps: Set<string>; toggleGap: (gap: ContentGap) => void } {
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(() => new Set())
  const [pendingGaps, setPendingGaps] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (pendingGaps.size === 0 || !contents) return
    setExpandedGaps((previous) => {
      const next = new Set(previous)
      for (const key of pendingGaps) next.add(key)
      return next
    })
    setPendingGaps(new Set())
  }, [contents, pendingGaps])

  function toggleGap(gap: ContentGap) {
    if (expandedGaps.has(gap.key)) {
      setExpandedGaps((previous) => {
        const next = new Set(previous)
        next.delete(gap.key)
        return next
      })
      return
    }
    if (!contents) {
      onNeedContents()
      setPendingGaps((previous) => new Set(previous).add(gap.key))
      return
    }
    setExpandedGaps((previous) => new Set(previous).add(gap.key))
  }

  return { expandedGaps, toggleGap }
}
