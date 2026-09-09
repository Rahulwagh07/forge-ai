'use client'
import type { ReactNode } from 'react'
import { AgentAvatar } from '@/components/workspace/chat/agent-avatar'
import { formatFullDate } from '@/lib/utils'

export const AGENT_NAME = 'Forge'

export function AgentTurn({ createdAt, children }: { createdAt?: string; children: ReactNode }) {
  const date = formatFullDate(createdAt)
  return (
    <div className="flex gap-2">
      <AgentAvatar size={24} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold leading-[20px] text-foreground">
            {AGENT_NAME}
          </span>
          {date ? (
            <span className="text-[12px] leading-[16px] text-muted-foreground">{date}</span>
          ) : null}
        </div>
        <div className="mt-1 text-[14px] leading-[21px] text-foreground outline-none">
          {children}
        </div>
      </div>
    </div>
  )
}
