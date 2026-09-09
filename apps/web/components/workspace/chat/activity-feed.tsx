'use client'
import { HugeiconsIcon } from '@hugeicons/react'
import { GitBranchIcon } from '@hugeicons/core-free-icons'
import { ThinkingBlock } from '@/components/workspace/chat/tool-row'
import { formatDuration } from '@/lib/session-chat'
import { MessageContent } from '@/components/workspace/chat/message-content'
import { AgentAvatar } from '@/components/workspace/chat/agent-avatar'
import type { ReactNode } from 'react'
import { formatFullDate } from '@/lib/utils'
import type { ChatItem, PullRequestInfo } from '@/lib/types'

const AGENT_NAME = 'Forge'

function ThoughtBlock({ item }: { item: ChatItem }) {
  const duration = item.durationMs ? ` for ${formatDuration(item.durationMs)}` : ''
  return (
    <details className="group ml-8 mt-3">
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

function AgentTurn({ createdAt, children }: { createdAt?: string; children: ReactNode }) {
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

function PullRequestCard({ pr }: { pr: PullRequestInfo }) {
  const iconColor =
    pr.state === 'closed' ? 'text-danger' : pr.state === 'merged' ? 'text-merged' : 'text-success'
  return (
    <div className="mt-3 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm">
        <HugeiconsIcon icon={GitBranchIcon} size={14} className={iconColor} />
        <span className="font-semibold">Changes ready for review</span>
        {pr.files !== undefined ? (
          <span className="ml-auto text-sm text-muted-foreground">
            {pr.files} {pr.files === 1 ? 'file' : 'files'}
          </span>
        ) : null}
      </div>
      <div className="mt-2 truncate text-sm font-medium">
        {pr.repoFullName ? `${pr.repoFullName} #${pr.number}` : (pr.title ?? 'Agent changes')}
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        {pr.additions !== undefined ? <span className="text-success">+{pr.additions}</span> : null}
        {pr.deletions !== undefined ? <span className="text-danger">-{pr.deletions}</span> : null}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md px-2.5 py-1.5 text-sm font-medium btn-google outline-none"
        >
          Review pull request
        </a>
      </div>
    </div>
  )
}

function looksLikeKnowledge(text: string): boolean {
  return /accessed knowledge|context compacted|knowledge/i.test(text)
}

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

  const prByToolIndex = new Map<number, PullRequestInfo>()
  items.forEach((it, i) => {
    if (it.kind === 'pr_created' && it.pr) {
      for (let j = i - 1; j >= 0; j -= 1) {
        if (items[j]?.role === 'user') break
        if (items[j]?.role === 'tool') {
          prByToolIndex.set(j, it.pr)
          break
        }
      }
    }
  })

  const nodes: ReactNode[] = []
  let agentOpen = false

  for (let index = 0; index < items.length; index += 1) {
    const it = items[index]
    if (!it) continue
    if (it.role === 'tool' && (index === 0 || items[index - 1]?.role !== 'tool')) {
      const group: ChatItem[] = []
      for (
        let cursor = index;
        cursor < items.length && items[cursor]?.role === 'tool';
        cursor += 1
      ) {
        const tool = items[cursor]
        if (tool) group.push(tool)
      }
      const pr = prByToolIndex.get(index)
      nodes.push(
        <div key={it.id} className="mt-2.5">
          <ThinkingBlock items={group} additions={pr?.additions} deletions={pr?.deletions} />
        </div>,
      )
      continue
    }
    if (it.role === 'tool') continue
    if (it.role === 'user') {
      agentOpen = false
      nodes.push(
        <div key={it.id} className="mt-4 flex justify-end">
          <div className="max-w-[75%] rounded-lg bg-chat-input px-3 py-[7px] text-[14px] leading-[20px] text-foreground outline-none">
            <MessageContent text={it.text ?? ''} />
          </div>
        </div>,
      )
      continue
    }
    if (it.role === 'assistant' && it.isThinking) {
      nodes.push(<ThoughtBlock key={it.id} item={it} />)
      continue
    }
    if (it.role === 'assistant') {
      // Group consecutive replies into one turn: header row on top,
      // every paragraph below it
      const group: ChatItem[] = [it]
      while (
        index + 1 < items.length &&
        items[index + 1]?.role === 'assistant' &&
        !items[index + 1]?.isThinking
      ) {
        index += 1
        const next = items[index]
        if (next) group.push(next)
      }
      const first = group[0]
      agentOpen = true
      nodes.push(
        <div key={it.id} className="mt-2.5">
          <AgentTurn createdAt={first?.createdAt}>
            <div className="space-y-3">
              {group.map((g) => (
                <MessageContent key={g.id} text={g.text ?? ''} />
              ))}
            </div>
          </AgentTurn>
        </div>,
      )
      continue
    }
    if (it.kind === 'pr_created' && it.pr) {
      nodes.push(<PullRequestCard key={it.id} pr={it.pr} />)
      continue
    }
    if (it.kind === 'status' || it.role === 'system') {
      const text = it.text ?? ''
      if (!text) continue
      if (text.includes('No changes')) {
        agentOpen = false
        nodes.push(
          <div key={it.id} className="mt-3 flex justify-center">
            <div className="rounded-full bg-warning-bg px-3 py-1 text-[13px] text-warning">
              {text}
            </div>
          </div>,
        )
        continue
      }
      if (looksLikeKnowledge(text)) {
        nodes.push(
          <div
            key={it.id}
            className="ml-8 mt-4 flex items-center gap-2 text-[13px] leading-[18px] text-muted-foreground"
          >
            <span aria-hidden="true" className="text-[13px]">
              ⓘ
            </span>
            <span>{text}</span>
          </div>,
        )
        continue
      }
      agentOpen = agentOpen && !/went to sleep|asleep|paused|waiting/i.test(text)
      nodes.push(
        <div
          key={it.id}
          className="ml-8 mt-2 flex items-center gap-2 text-[13px] leading-[18px] text-muted-foreground"
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
          <span>{text}</span>
        </div>,
      )
      continue
    }
    nodes.push(
      <div key={it.id} className="mt-2 px-0 text-[13px] text-muted-foreground">
        {it.text}
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
