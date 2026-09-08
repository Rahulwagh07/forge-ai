'use client'

import { type ComponentProps, useMemo } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import parseDiff from 'parse-diff'

import { cn } from '@/lib/utils'

type DiffLineType = 'add' | 'del' | 'normal'

interface ParsedLine {
  type: DiffLineType
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

interface ParsedFile {
  oldName?: string | undefined
  newName?: string | undefined
  lines: ParsedLine[]
  additions: number
  deletions: number
}

interface SplitLinePair {
  left: ParsedLine | null
  right: ParsedLine | null
}

function parsePatch(patch: string): ParsedFile[] {
  const files = parseDiff(patch)
  return files.map((file) => {
    const lines: ParsedLine[] = []
    let additions = 0
    let deletions = 0
    for (const chunk of file.chunks) {
      let oldLine = chunk.oldStart
      let newLine = chunk.newStart
      for (const change of chunk.changes) {
        if (change.type === 'add') {
          additions++
          lines.push({
            type: 'add',
            content: change.content.slice(1),
            newLineNumber: newLine++,
          })
        } else if (change.type === 'del') {
          deletions++
          lines.push({
            type: 'del',
            content: change.content.slice(1),
            oldLineNumber: oldLine++,
          })
        } else {
          lines.push({
            type: 'normal',
            content: change.content.slice(1),
            oldLineNumber: oldLine++,
            newLineNumber: newLine++,
          })
        }
      }
    }
    return {
      oldName: file.from,
      newName: file.to,
      lines,
      additions,
      deletions,
    }
  })
}

function pairLinesForSplit(lines: ParsedLine[]): SplitLinePair[] {
  const pairs: SplitLinePair[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!
    if (line.type === 'normal') {
      pairs.push({ left: line, right: line })
      i++
    } else if (line.type === 'del') {
      const deletions: ParsedLine[] = []
      while (i < lines.length && lines[i]!.type === 'del') {
        deletions.push(lines[i]!)
        i++
      }
      const additions: ParsedLine[] = []
      while (i < lines.length && lines[i]!.type === 'add') {
        additions.push(lines[i]!)
        i++
      }
      const maxLen = Math.max(deletions.length, additions.length)
      for (let j = 0; j < maxLen; j++) {
        pairs.push({
          left: deletions[j] ?? null,
          right: additions[j] ?? null,
        })
      }
    } else {
      pairs.push({ left: null, right: line })
      i++
    }
  }
  return pairs
}

const diffViewerVariants = cva(
  'aui-diff-viewer overflow-hidden font-mono leading-relaxed [font-variant-ligatures:none]',
  {
    variants: {
      variant: {
        default: 'border-foreground/10 bg-foreground/[0.025] dark:bg-foreground/[0.04] border',
        ghost: 'bg-transparent',
        muted: 'border-foreground/10 bg-foreground/[0.06] dark:bg-foreground/[0.08] border',
      },
      size: {
        sm: 'text-[11px]',
        default: 'text-[12.5px]',
        lg: 'text-[13.5px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

const diffLineVariants = cva('flex', {
  variants: {
    type: {
      add: 'bg-[var(--diff-add-bg,var(--_diff-add-bg))] shadow-[inset_2px_0_0_var(--diff-add-rule,var(--color-green-500))] [--_diff-add-bg:color-mix(in_oklab,var(--color-green-500)_8%,transparent)] dark:[--_diff-add-bg:color-mix(in_oklab,var(--color-green-500)_15%,transparent)]',
      del: 'bg-[var(--diff-del-bg,var(--_diff-del-bg))] shadow-[inset_2px_0_0_var(--diff-del-rule,var(--color-red-500))] [--_diff-del-bg:color-mix(in_oklab,var(--color-red-500)_8%,transparent)] dark:[--_diff-del-bg:color-mix(in_oklab,var(--color-red-500)_15%,transparent)]',
      normal: '',
      empty: '',
    },
  },
  defaultVariants: {
    type: 'normal',
  },
})

const diffLineTextVariants = cva('', {
  variants: {
    type: {
      add: 'text-[var(--diff-add-text,var(--color-green-600))] dark:text-[var(--diff-add-text-dark,var(--color-green-400))]',
      del: 'text-[var(--diff-del-text,var(--color-red-600))] dark:text-[var(--diff-del-text-dark,var(--color-red-400))]',
      normal: '',
      empty: '',
    },
  },
  defaultVariants: {
    type: 'normal',
  },
})

function DiffViewerStats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span data-slot="diff-viewer-stats" className="flex shrink-0 gap-1.5 text-[11px] tabular-nums">
      <span className="text-green-600 dark:text-green-400">+{additions}</span>
      <span className="text-red-600 dark:text-red-400">−{deletions}</span>
    </span>
  )
}

function DiffViewerFile({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="diff-viewer-file" className={cn(className)} {...props} />
}

interface DiffViewerHeaderProps extends ComponentProps<'div'> {
  oldName?: string | undefined
  newName?: string | undefined
  additions?: number
  deletions?: number
  showStats?: boolean
}

function DiffViewerHeader({
  oldName,
  newName,
  additions = 0,
  deletions = 0,
  showStats = true,
  className,
  ...props
}: DiffViewerHeaderProps) {
  if (!oldName && !newName) return null

  const displayName = newName || oldName

  return (
    <div
      data-slot="diff-viewer-header"
      className={cn(
        'border-foreground/10 text-muted-foreground flex h-9 items-center gap-2 border-b ps-3.5 pe-3 text-[11px] font-medium tracking-wide',
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">
        {oldName && newName && oldName !== newName ? (
          <>
            <span className="text-muted-foreground/60">{oldName}</span>
            <span className="text-muted-foreground/50">{' → '}</span>
            <span className="text-foreground/80">{newName}</span>
          </>
        ) : (
          displayName
        )}
      </span>
      {showStats && (additions > 0 || deletions > 0) && (
        <DiffViewerStats additions={additions} deletions={deletions} />
      )}
    </div>
  )
}

interface DiffViewerLineProps extends ComponentProps<'div'> {
  line: ParsedLine
  showLineNumbers?: boolean
}

function DiffViewerLine({
  line,
  showLineNumbers = true,
  className,
  ...props
}: DiffViewerLineProps) {
  return (
    <div
      data-slot="diff-viewer-line"
      data-type={line.type}
      className={cn(diffLineVariants({ type: line.type }), className)}
      {...props}
    >
      {showLineNumbers && (
        <span
          data-slot="diff-viewer-line-number"
          className="text-muted-foreground/40 w-10 shrink-0 px-2 text-end tabular-nums select-none"
        >
          {line.type === 'del'
            ? line.oldLineNumber
            : line.type === 'add'
              ? line.newLineNumber
              : line.oldLineNumber}
        </span>
      )}
      <span data-slot="diff-viewer-content" className="flex-1 pe-3.5 break-all whitespace-pre-wrap">
        {line.content}
      </span>
    </div>
  )
}

interface DiffViewerSplitLineProps extends ComponentProps<'div'> {
  pair: SplitLinePair
  showLineNumbers?: boolean
}

function DiffViewerSplitLine({
  pair,
  showLineNumbers = true,
  className,
  ...props
}: DiffViewerSplitLineProps) {
  const { left, right } = pair

  return (
    <div data-slot="diff-viewer-split-line" className={cn('flex', className)} {...props}>
      <div
        data-slot="diff-viewer-split-left"
        data-type={left?.type ?? 'empty'}
        className={cn(
          'border-foreground/10 flex w-1/2 border-e',
          diffLineVariants({ type: left?.type ?? 'empty' }),
        )}
      >
        {showLineNumbers && (
          <span className="text-muted-foreground/40 w-10 shrink-0 px-2 text-end tabular-nums select-none">
            {left?.oldLineNumber ?? ''}
          </span>
        )}
        <span
          className={cn(
            'w-4 shrink-0 text-center select-none',
            diffLineTextVariants({ type: left?.type ?? 'empty' }),
          )}
        >
          {left ? (left.type === 'del' ? '-' : ' ') : ''}
        </span>
        <span className="flex-1 pe-3.5 break-all whitespace-pre-wrap">{left?.content ?? ''}</span>
      </div>
      <div
        data-slot="diff-viewer-split-right"
        data-type={right?.type ?? 'empty'}
        className={cn('flex w-1/2', diffLineVariants({ type: right?.type ?? 'empty' }))}
      >
        {showLineNumbers && (
          <span className="text-muted-foreground/40 w-10 shrink-0 px-2 text-end tabular-nums select-none">
            {right?.newLineNumber ?? ''}
          </span>
        )}
        <span
          className={cn(
            'w-4 shrink-0 text-center select-none',
            diffLineTextVariants({ type: right?.type ?? 'empty' }),
          )}
        >
          {right ? (right.type === 'add' ? '+' : ' ') : ''}
        </span>
        <span className="flex-1 pe-3.5 break-all whitespace-pre-wrap">{right?.content ?? ''}</span>
      </div>
    </div>
  )
}

export type DiffViewerProps = VariantProps<typeof diffViewerVariants> & {
  patch?: string
  code?: string
  viewMode?: 'split' | 'unified'
  showLineNumbers?: boolean
  showStats?: boolean
  className?: string
}

function DiffViewer({
  code,
  patch,
  viewMode = 'unified',
  showLineNumbers = true,
  showStats = true,
  variant,
  size,
  className,
}: DiffViewerProps) {
  const diffPatch = patch ?? code

  const parsedFiles = useMemo<ParsedFile[]>(() => {
    if (diffPatch) {
      return parsePatch(diffPatch)
    }
    return []
  }, [diffPatch])

  const splitLinePairs = useMemo<SplitLinePair[][]>(() => {
    if (viewMode !== 'split') return []
    return parsedFiles.map((file) => pairLinesForSplit(file.lines))
  }, [parsedFiles, viewMode])

  if (parsedFiles.length === 0) {
    return (
      <pre
        data-slot="diff-viewer"
        className={cn(
          'border-foreground/10 bg-foreground/[0.025] dark:bg-foreground/[0.04] text-muted-foreground border px-3.5 py-3 font-mono text-xs',
          className,
        )}
      >
        No diff content provided
      </pre>
    )
  }

  return (
    <div
      data-slot="diff-viewer"
      data-view-mode={viewMode}
      data-variant={variant ?? 'default'}
      data-size={size ?? 'default'}
      className={cn(diffViewerVariants({ variant, size }), className)}
    >
      {parsedFiles.map((file, fileIndex) => (
        <div
          key={fileIndex}
          data-slot="diff-viewer-file"
          className="border-foreground/10 [contain-intrinsic-size:auto_240px] [content-visibility:auto] not-first:border-t"
        >
          <DiffViewerHeader
            oldName={file.oldName}
            newName={file.newName}
            additions={file.additions}
            deletions={file.deletions}
            showStats={showStats}
          />
          <div data-slot="diff-viewer-content" className="overflow-x-auto">
            {viewMode === 'split'
              ? (splitLinePairs[fileIndex] ?? []).map((pair, pairIndex) => (
                  <DiffViewerSplitLine
                    key={pairIndex}
                    pair={pair}
                    showLineNumbers={showLineNumbers}
                  />
                ))
              : file.lines.map((line, lineIndex) => (
                  <DiffViewerLine key={lineIndex} line={line} showLineNumbers={showLineNumbers} />
                ))}
          </div>
        </div>
      ))}
    </div>
  )
}

DiffViewer.displayName = 'DiffViewer'

export type { ParsedLine, ParsedFile, SplitLinePair }

export { DiffViewer, DiffViewerFile, DiffViewerStats, parsePatch }
