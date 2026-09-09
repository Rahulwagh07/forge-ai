'use client'

import type { ChatItem } from '@/lib/types'
import { describeToolCall, formatDuration } from '@/lib/session-chat'

function DiffStats({ additions, deletions }: { additions?: number; deletions?: number }) {
  if (additions === undefined && deletions === undefined) return null
  return (
    <span className="ml-2 inline-flex items-center gap-1.5 font-medium">
      {additions !== undefined ? <span className="text-success">+{additions}</span> : null}
      {deletions !== undefined ? <span className="text-danger">-{deletions}</span> : null}
    </span>
  )
}

export function ThinkingBlock({
  items,
  additions,
  deletions,
  nested,
}: {
  items: ChatItem[]
  additions?: number
  deletions?: number
  nested?: boolean
}) {
  const first = items[0]
  if (!first) return null
  const durationMs = items.reduce((total, item) => total + (item.durationMs ?? 0), 0)
  const duration = durationMs > 0 ? ` for ${formatDuration(durationMs)}` : ''
  return (
    <details className={nested ? 'group mt-2' : 'group ml-8'}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] text-muted-foreground outline-none marker:hidden">
        <span className="text-[13px] leading-none transition-transform group-open:rotate-90">
          ›
        </span>
        <span>
          Worked{duration}
          <DiffStats additions={additions} deletions={deletions} />
        </span>
      </summary>
      <div className="space-y-1 pb-1 pt-2 text-[13px] leading-[19px] text-muted-foreground">
        {items.map((item) => (
          <div key={item.id}>{describeToolCall(item)}</div>
        ))}
      </div>
    </details>
  )
}
