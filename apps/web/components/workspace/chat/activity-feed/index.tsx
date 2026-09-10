'use client'
import type { ReactNode } from 'react'
import { ThinkingBlock } from '@/components/workspace/chat/tool-row'
import { MessageContent } from '@/components/workspace/chat/message-content'
import { AgentAvatar } from '@/components/workspace/chat/agent-avatar'
import type { ChatItem, PullRequestInfo } from '@/lib/types'
import { AGENT_NAME, AgentTurn } from './agent-turn'
import { PullRequestCard } from './pull-request-card'
import { ThoughtBlock } from './thought-block'
import { collectNestedWork, collectToolRun } from './nesting'

export function ActivityFeed({
  items,
  showThinking = false,
  currentAction,
  waitingOnUser = false,
  onWake,
}: {
  items: ChatItem[]
  showThinking?: boolean
  currentAction?: string
  waitingOnUser?: boolean
  onWake?: () => Promise<void> | void
}) {
  if (items.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
        <div>
          Waiting for {AGENT_NAME.toLowerCase()}… The first <code>listDir</code> /{' '}
          <code>readFile</code> will appear here.
        </div>
      </div>
    )
  }

  const prByRunStart = new Map<number, PullRequestInfo>()
  items.forEach((item, i) => {
    if (item.kind === 'pr_created' && item.pr) {
      for (let j = i - 1; j >= 0; j -= 1) {
        if (items[j]?.role === 'user') break
        if (items[j]?.role === 'tool') {
          prByRunStart.set(j, item.pr)
          break
        }
      }
    }
  })

  const nodes: ReactNode[] = []

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!item) continue
    if (item.role === 'tool' && (index === 0 || items[index - 1]?.role !== 'tool')) {
      const { run } = collectToolRun(items, index)
      const pr = prByRunStart.get(index)
      nodes.push(
        <div key={item.id} className="mt-2.5">
          <ThinkingBlock items={run} additions={pr?.additions} deletions={pr?.deletions} />
        </div>,
      )
      continue
    }
    if (item.role === 'tool') continue
    if (item.role === 'user') {
      nodes.push(
        <div key={item.id} className="mt-4 flex justify-end">
          <div className="max-w-[75%] rounded-lg bg-chat-input px-3 py-[7px] text-[14px] leading-[20px] text-foreground outline-none">
            <MessageContent text={item.text ?? ''} />
          </div>
        </div>,
      )
      continue
    }
    if (item.role === 'assistant' && item.isThinking) {
      nodes.push(<ThoughtBlock key={item.id} item={item} />)
      continue
    }
    if (item.role === 'assistant') {
      const nested = collectNestedWork(items, index, prByRunStart)
      index = nested.end
      nodes.push(
        <div key={item.id} className="mt-2.5">
          <AgentTurn createdAt={item.createdAt}>
            <div className="space-y-3">
              <MessageContent text={item.text ?? ''} />
            </div>
            {nested.children.length > 0 ? <div className="mt-1">{nested.children}</div> : null}
          </AgentTurn>
        </div>,
      )
      continue
    }
    if (item.kind === 'pr_created' && item.pr) {
      nodes.push(<PullRequestCard key={item.id} pr={item.pr} />)
      continue
    }
    if (item.kind === 'status' || item.role === 'system') {
      const text = item.text ?? ''
      if (!text) continue
      if (text.includes('No changes')) {
        nodes.push(
          <div key={item.id} className="mt-3 flex justify-center">
            <div className="rounded-full bg-warning-bg px-3 py-1 text-[13px] text-warning">
              {text}
            </div>
          </div>,
        )
        continue
      }
      const failed = Boolean(item.isError)
      nodes.push(
        <div
          key={item.id}
          className="ml-8 mt-2 flex items-center gap-2 text-[13px] leading-[18px] text-muted-foreground"
        >
          <span className={failed ? 'text-danger' : undefined}>{text}</span>
        </div>,
      )
      continue
    }
    nodes.push(
      <div key={item.id} className="mt-2 px-0 text-[13px] text-muted-foreground">
        {item.text}
      </div>,
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 outline-none">
      {nodes}
      {waitingOnUser ? (
        <div className="mt-4 flex items-center gap-2">
          <AgentAvatar size={24} />
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {AGENT_NAME} is waiting on you — reply above to continue.{' '}
            {onWake ? (
              <button
                type="button"
                onClick={() => void onWake()}
                className="cursor-pointer font-medium text-foreground underline-offset-2 hover:underline"
              >
                Wake up {AGENT_NAME}
              </button>
            ) : null}
          </p>
        </div>
      ) : null}
      {showThinking && !waitingOnUser ? (
        <div className="mt-4 flex items-center gap-2" role="status" aria-label="Forge is working">
          <AgentAvatar size={24} />
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {currentAction ? `${currentAction}…` : `${AGENT_NAME} is working…`}
            <span className="ml-1 inline-flex gap-0.5" aria-hidden="true">
              <span className="animate-pulse">•</span>
              <span className="animate-pulse delay-150">•</span>
              <span className="animate-pulse delay-300">•</span>
            </span>
          </span>
        </div>
      ) : null}
    </div>
  )
}
