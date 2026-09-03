'use client'

import type { ChatItem } from '@/lib/types'

function labelFor(item: ChatItem): string {
  if (item.toolName === 'runCommand') return 'Running a command in the sandbox'
  if (item.toolName === 'writeFile') return `Writing ${String(item.toolInput?.path ?? 'a file')}`
  if (item.toolName === 'readFile') return `Reading ${String(item.toolInput?.path ?? 'a file')}`
  if (item.toolName === 'listDir')
    return `Exploring ${String(item.toolInput?.path ?? 'the repository')}`
  if (item.toolName === 'commitAndOpenPR') return 'Preparing the branch for review'
  if (item.toolName === 'finishSession') return 'Pausing for your input'
  return 'Working in the sandbox'
}

export function ThinkingBlock({ items }: { items: ChatItem[] }) {
  const first = items[0]
  if (!first) return null
  const durationMs = items.reduce((total, item) => total + (item.durationMs ?? 0), 0)
  const duration = durationMs > 0 ? ` for ${formatDuration(durationMs)}` : ''
  return (
    <details className="group px-3 py-1 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground outline-none marker:hidden">
        <span className="text-sm leading-none transition-transform group-open:rotate-90">›</span>
        Worked{duration}
      </summary>
      <div className="space-y-1 pb-1 pt-2 pl-6 text-sm text-muted-foreground">
        {items.map((item) => (
          <div key={item.id}>{labelFor(item)}</div>
        ))}
      </div>
    </details>
  )
}

function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000)
  return seconds > 0 ? `${seconds}s` : `${durationMs}ms`
}
