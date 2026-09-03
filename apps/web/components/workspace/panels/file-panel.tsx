'use client'

import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Search01Icon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { parseDiff, type DiffLine } from '@/components/workspace/panels/diff-utils'

function lineClass(kind: DiffLine['kind']): string {
  if (kind === 'addition') return 'bg-emerald-500/10 text-emerald-300'
  if (kind === 'deletion') return 'bg-red-500/10 text-red-300'
  if (kind === 'hunk') return 'bg-blue-500/10 text-blue-300'
  return 'text-foreground'
}

export function FilePanel({ diff }: { diff: string }) {
  const files = useMemo(() => parseDiff(diff), [diff])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const visibleFiles = files.filter((file) => file.path.toLowerCase().includes(query.toLowerCase()))
  const selected = files.find((file) => file.path === selectedPath) ?? visibleFiles[0] ?? files[0]
  const lines: DiffLine[] = selected?.lines ?? []

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
      <div className="flex min-h-0 flex-1">
        <ScrollArea className="w-52 shrink-0 border-r bg-muted/10">
          <div className="space-y-0.5 p-1.5">
            {visibleFiles.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedPath(file.path)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${selected?.path === file.path ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}
              >
                <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                <span className="shrink-0 text-sm text-emerald-400">+{file.additions}</span>
                <span className="shrink-0 text-sm text-red-400">-{file.deletions}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
        <div className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b bg-muted/10 px-3 py-2">
                <span className="min-w-0 truncate font-mono text-sm">{selected.path}</span>
                <span className="ml-auto shrink-0 font-mono text-sm text-muted-foreground">
                  {selected.kind === 'created' ? 'U' : 'M'}
                </span>
                <span className="text-sm text-emerald-400">+{selected.additions}</span>
                <span className="text-sm text-red-400">-{selected.deletions}</span>
              </div>
              <ScrollArea className="min-h-0 flex-1 bg-background">
                <div className="min-w-max py-2 font-mono text-sm leading-5">
                  {lines.map((line, index) => (
                    <div
                      key={`${selected.path}-${index}`}
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
              </ScrollArea>
            </>
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              No matching files
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
