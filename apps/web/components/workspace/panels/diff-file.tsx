'use client'

import { memo, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChevronRightIcon, Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { DiffViewerFile, DiffViewerStats } from '@/components/ui/diff-viewer'
import { splitPath, cn } from '@/lib/utils'
import {
  DIFF_STATUS_LABEL,
  buildFileDiffText,
  contentGaps,
  splitFileLines,
  visibleHunks,
  type ParsedFileChange,
} from '@/lib/diff'
import { useCopyConfirmation } from '@/hooks/use-copy-confirmation'
import { useExpandedGaps } from '@/hooks/use-expanded-gaps'
import type { DiffFileContents } from '@/lib/types'
import { DiffFileBody } from './diff-file-body'
import type { DiffView } from './view-toggle'

export type { DiffView } from './view-toggle'

export const DiffFile = memo(function DiffFile({
  file,
  view,
  open,
  active,
  loading = false,
  binary,
  contents,
  onNeedContents,
  onToggle,
}: {
  file: ParsedFileChange
  view: DiffView
  open: boolean
  active: boolean
  loading?: boolean
  binary: boolean
  contents: DiffFileContents | null
  onNeedContents: () => void
  onToggle: () => void
}) {
  const { name, dir } = splitPath(file.path)
  const [copied, copy] = useCopyConfirmation()
  const [showAll, setShowAll] = useState(false)
  const { expandedGaps, toggleGap } = useExpandedGaps(contents, onNeedContents)

  const totalLines = file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0)
  const shownHunks = visibleHunks(file.hunks, showAll)
  const shownLines = shownHunks.reduce((sum, hunk) => sum + hunk.lines.length, 0)
  const remaining = totalLines - shownLines

  const oldLines = useMemo(() => (contents ? splitFileLines(contents.oldContent) : []), [contents])
  const newLines = useMemo(() => (contents ? splitFileLines(contents.newContent) : []), [contents])
  const gaps = useMemo(
    () =>
      binary
        ? []
        : contentGaps(
            shownHunks,
            contents && showAll ? oldLines.length : undefined,
            contents && showAll ? newLines.length : undefined,
          ),
    [binary, shownHunks, contents, showAll, oldLines.length, newLines.length],
  )

  const isOneSidedFile = file.status === 'created' || file.status === 'deleted'
  const resolvedViewMode: DiffView = view === 'split' && isOneSidedFile ? 'unified' : view

  return (
    <DiffViewerFile
      aria-labelledby={`diff-title-${file.path}`}
      data-active={active ? 'true' : undefined}
      className={cn('scroll-mt-2 border-b border-border bg-diff-surface')}
    >
      <div
        data-slot="diff-viewer-header"
        className="flex w-full items-center gap-1.5 bg-diff-header px-2 py-2 text-sm"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-labelledby={`diff-title-${file.path}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left focus-visible:outline-2 focus-visible:outline-ring"
        >
          <HugeiconsIcon
            icon={ChevronRightIcon}
            size={14}
            className={cn(
              'shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
          <span id={`diff-title-${file.path}`} className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground">{name}</span>
            {dir ? (
              <span className="ml-2 truncate font-mono text-muted-foreground">{dir}</span>
            ) : null}
            {file.previousPath !== undefined ? (
              <span className="ml-2 truncate font-mono text-xs text-muted-foreground">
                renamed from {file.previousPath}
              </span>
            ) : null}
          </span>
        </button>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline-block">
          {DIFF_STATUS_LABEL[file.status]}
        </span>
        <button
          type="button"
          onClick={() => copy(buildFileDiffText(file))}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Copy file diff"
          aria-label={`Copy diff for ${file.path}`}
        >
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={14} />
        </button>
        <span className="sr-only">{DIFF_STATUS_LABEL[file.status]},</span>

        {file.additions > 0 || file.deletions > 0 ? (
          <DiffViewerStats additions={file.additions} deletions={file.deletions} />
        ) : null}
      </div>
      {open ? (
        <div data-slot="diff-viewer-content" className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <p
              className="px-4 py-2 font-sans text-xs text-muted-foreground"
              role="status"
              aria-label="Loading diff"
            >
              Loading diff…
            </p>
          ) : (
            <DiffFileBody
              hunks={shownHunks}
              gaps={gaps}
              viewMode={resolvedViewMode}
              newLines={newLines}
              showAll={showAll}
              remaining={remaining}
              expandedGaps={expandedGaps}
              onToggleGap={toggleGap}
              onShowAll={() => setShowAll(true)}
            />
          )}
        </div>
      ) : null}
    </DiffViewerFile>
  )
})
