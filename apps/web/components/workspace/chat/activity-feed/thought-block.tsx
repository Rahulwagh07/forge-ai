'use client'
import { MessageContent } from '@/components/workspace/chat/message-content'
import { formatDuration } from '@/lib/session-chat'
import type { ChatItem } from '@/lib/types'

export function ThoughtBlock({ item, nested }: { item: ChatItem; nested?: boolean }) {
  const duration = item.durationMs ? ` for ${formatDuration(item.durationMs)}` : ''
  return (
    <details className={nested ? 'group mt-2' : 'group ml-8 mt-3'}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] text-muted-foreground outline-none marker:hidden">
        <span className="text-[13px] leading-none transition-transform group-open:rotate-90">
          ›
        </span>
        <span>Thought{duration}</span>
      </summary>
      <div className="pt-1.5 text-[13px] leading-[19px] text-muted-foreground">
        <MessageContent text={item.text ?? ''} />
      </div>
    </details>
  )
}
