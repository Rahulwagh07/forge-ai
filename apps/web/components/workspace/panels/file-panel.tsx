'use client'

import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChevronRightIcon, Copy01Icon, Search01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { parseDiff, type DiffLine } from '@/components/workspace/panels/diff-utils'
import { splitPath } from '@/lib/utils'

function lineClass(kind: DiffLine['kind']): string {
  if (kind === 'addition') return 'bg-emerald-500/10 text-emerald-300'
  if (kind === 'deletion') return 'bg-red-500/10 text-red-300'
  if (kind === 'hunk') return 'bg-blue-500/10 text-blue-300'
  return 'text-foreground'
}

export function FilePanel({ diff }: { diff: string }) {
  const files = useMemo(() => parseDiff(diff), [diff])
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const visibleFiles = files.filter((file) => file.path.toLowerCase().includes(query.toLowerCase()))

  function toggle(path: string) {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function copyPath(event: React.MouseEvent, path: string) {
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(path)
      window.setTimeout(() => {
        setCopiedPath((current) => (current === path ? null : current))
      }, 1200)
    } catch {
      // clipboard unavailable
    }
  }

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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files"
            className="h-9 border-0 pl-9 text-sm"
          />
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">
          {files.length} {files.length === 1 ? 'file' : 'files'}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1 bg-background">
        <div className="divide-y divide-border">
          {visibleFiles.map((file) => {
            const { name, dir } = splitPath(file.path)
            const open = expanded.has(file.path)
            return (
              <div key={file.path}>
                <div className="flex w-full items-center gap-1.5 px-2 py-2 text-sm hover:bg-muted/40">
                  <button
                    type="button"
                    onClick={() => toggle(file.path)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <HugeiconsIcon
                      icon={ChevronRightIcon}
                      size={14}
                      className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-foreground">{name}</span>
                      {dir ? (
                        <span className="ml-2 truncate font-mono text-muted-foreground">{dir}</span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => void copyPath(event, file.path)}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Copy file path"
                    aria-label={`Copy path ${file.path}`}
                  >
                    <HugeiconsIcon
                      icon={copiedPath === file.path ? Tick02Icon : Copy01Icon}
                      size={14}
                    />
                  </button>
                  <span className="shrink-0 font-mono text-sm text-emerald-400">
                    +{file.additions}
                  </span>
                  <span className="shrink-0 font-mono text-sm text-red-400">-{file.deletions}</span>
                </div>
                {open ? (
                  <div className="min-w-max border-t border-border py-2 font-mono text-sm leading-5">
                    {file.lines.map((line, index) => (
                      <div
                        key={`${file.path}-${index}`}
                        className={`flex min-h-5 whitespace-pre ${lineClass(line.kind)}`}
                      >
                        <span className="w-12 shrink-0 select-none border-r border-border px-2 text-right text-muted-foreground">
                          {line.oldLine ?? ''}
                        </span>
                        <span className="w-12 shrink-0 select-none border-r border-border px-2 text-right text-muted-foreground">
                          {line.newLine ?? ''}
                        </span>
                        <span className="w-5 shrink-0 select-none px-1 text-center">
                          {line.kind === 'addition' ? '+' : line.kind === 'deletion' ? '-' : ' '}
                        </span>
                        <span className="px-2">
                          {(line.kind === 'addition' ||
                          line.kind === 'deletion' ||
                          line.kind === 'context'
                            ? line.text.slice(1)
                            : line.text) || ' '}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
          {visibleFiles.length === 0 ? (
            <div className="grid place-items-center p-8 text-sm text-muted-foreground">
              No matching files
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
