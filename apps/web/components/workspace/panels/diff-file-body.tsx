'use client'

import { DiffViewer } from '@/components/ui/diff-viewer'
import {
  MAX_VISIBLE_DIFF_LINES,
  contextPatch,
  hunkOnlyPatch,
  type ContentGap,
  type DiffHunk,
} from '@/lib/diff'
import type { DiffView } from './view-toggle'

function GapToggle({
  children,
  ariaLabel,
  onClick,
}: {
  children: string
  ariaLabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-6 w-full items-center justify-center gap-1 bg-expand font-sans text-xs text-expand-text hover:bg-expand/80"
      aria-label={ariaLabel}
    >
      <span aria-hidden="true">↕</span> {children}
    </button>
  )
}

function GapRow({
  gap,
  expanded,
  viewMode,
  newLines,
  showAll,
  onToggle,
}: {
  gap: ContentGap
  expanded: boolean
  viewMode: DiffView
  newLines: string[]
  showAll: boolean
  onToggle: (gap: ContentGap) => void
}) {
  const expandLabel = `Expand ${gap.count} unchanged ` + (gap.count === 1 ? 'line' : 'lines')
  if (!expanded) {
    return (
      <GapToggle ariaLabel={expandLabel} onClick={() => onToggle(gap)}>
        {expandLabel}
      </GapToggle>
    )
  }
  const gapLines = newLines.slice(gap.newStart - 1, gap.newStart - 1 + gap.count)
  const sliced = showAll ? gapLines : gapLines.slice(0, MAX_VISIBLE_DIFF_LINES)
  return (
    <div>
      <DiffViewer
        patch={contextPatch(gap.oldStart, gap.newStart, sliced)}
        viewMode={viewMode}
        variant="ghost"
        showStats={false}
      />
      {!showAll && gapLines.length > sliced.length ? (
        <p className="px-4 py-1 font-sans text-xs text-muted-foreground">
          Showing first {sliced.length} of {gapLines.length} lines — show all for the rest.
        </p>
      ) : null}
      <GapToggle ariaLabel="Collapse expanded lines" onClick={() => onToggle(gap)}>
        Collapse
      </GapToggle>
    </div>
  )
}

export function DiffFileBody({
  hunks,
  gaps,
  viewMode,
  newLines,
  showAll,
  remaining,
  expandedGaps,
  onToggleGap,
  onShowAll,
}: {
  hunks: DiffHunk[]
  gaps: ContentGap[]
  viewMode: DiffView
  newLines: string[]
  showAll: boolean
  remaining: number
  expandedGaps: Set<string>
  onToggleGap: (gap: ContentGap) => void
  onShowAll: () => void
}) {
  if (hunks.length === 0) {
    return <p className="px-4 py-2 font-sans text-xs text-muted-foreground">No hunks to display.</p>
  }
  const gapByHunk = new Map<number, ContentGap[]>()
  for (const gap of gaps) {
    const list = gapByHunk.get(gap.beforeHunk) ?? []
    list.push(gap)
    gapByHunk.set(gap.beforeHunk, list)
  }
  return (
    <>
      {hunks.map((hunk, hunkIndex) => (
        <div
          // Hunk order is stable for a given diff string.
          // eslint-disable-next-line react/no-array-index-key
          key={hunkIndex}
        >
          {(gapByHunk.get(hunkIndex) ?? []).map((gap) => (
            <GapRow
              key={gap.key}
              gap={gap}
              expanded={expandedGaps.has(gap.key)}
              viewMode={viewMode}
              newLines={newLines}
              showAll={showAll}
              onToggle={onToggleGap}
            />
          ))}
          <DiffViewer
            patch={hunkOnlyPatch([hunk])}
            viewMode={viewMode}
            variant="ghost"
            showStats={false}
          />
        </div>
      ))}
      {(gapByHunk.get(hunks.length) ?? []).map((gap) => (
        <GapRow
          key={gap.key}
          gap={gap}
          expanded={expandedGaps.has(gap.key)}
          viewMode={viewMode}
          newLines={newLines}
          showAll={showAll}
          onToggle={onToggleGap}
        />
      ))}
      {!showAll && remaining > 0 ? (
        <button
          type="button"
          onClick={onShowAll}
          className="flex w-full items-center justify-center gap-1 bg-expand py-2 font-sans text-xs text-expand-text hover:bg-expand/80"
        >
          Show all {remaining} more {remaining === 1 ? 'line' : 'lines'}
        </button>
      ) : null}
    </>
  )
}
