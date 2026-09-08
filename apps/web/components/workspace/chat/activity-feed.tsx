'use client'
import { HugeiconsIcon } from '@hugeicons/react'
import { GitBranchIcon } from '@hugeicons/core-free-icons'
import { ThinkingBlock } from '@/components/workspace/chat/tool-row'
import { MessageContent } from '@/components/workspace/chat/message-content'
import { formatTime } from '@/lib/utils'
import type { ChatItem, PullRequestInfo } from '@/lib/types'

function ThoughtBlock({ item }: { item: ChatItem }) {
  const duration = item.durationMs ? ` for ${formatDuration(item.durationMs)}` : ''
  return (
    <details className="group px-3 py-1 text-sm text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-2 outline-none marker:hidden">
        <span className="text-sm leading-none transition-transform group-open:rotate-90">›</span>
        Thought{duration}
      </summary>
      <div className="pt-1 pl-4 text-sm leading-relaxed">
        <MessageContent text={item.text ?? ''} />
      </div>
    </details>
  )
}

function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000)
  return seconds > 0 ? `${seconds}s` : `${durationMs}ms`
}

function PullRequestCard({ pr }: { pr: PullRequestInfo }) {
  const iconColor =
    pr.state === 'closed' ? 'text-danger' : pr.state === 'merged' ? 'text-merged' : 'text-success'
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
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

export function ActivityFeed({
  items,
  showThinking = false,
}: {
  items: ChatItem[]
  showThinking?: boolean
}) {
  if (items.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
        <div>
          Waiting for agent… The first <code>listDir</code> / <code>readFile</code> will appear
          here.
        </div>
      </div>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 outline-none">
      {items.map((it, index) => {
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
          return <ThinkingBlock key={it.id} items={group} />
        }
        if (it.role === 'tool') return null
        if (it.role === 'user') {
          return (
            <div key={it.id} className="flex justify-end">
              <div className="flex max-w-3/4 flex-col items-end gap-1">
                <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground outline-none">
                  <MessageContent text={it.text ?? ''} />
                </div>
                {it.createdAt ? (
                  <span className="px-1 text-xs text-muted-foreground">
                    {formatTime(it.createdAt)}
                  </span>
                ) : null}
              </div>
            </div>
          )
        }
        if (it.role === 'assistant' && it.isThinking) return <ThoughtBlock key={it.id} item={it} />
        if (it.role === 'assistant') {
          return (
            <div key={it.id} className="flex justify-start">
              <div className="w-full px-4 py-2 text-sm leading-relaxed text-foreground outline-none">
                <MessageContent text={it.text ?? ''} />
              </div>
            </div>
          )
        }
        if (it.kind === 'pr_created' && it.pr) return <PullRequestCard key={it.id} pr={it.pr} />
        if (it.kind === 'status' && it.text?.includes('No changes')) {
          return (
            <div key={it.id} className="flex justify-center">
              <div className="rounded-full bg-warning-bg px-3 py-1 text-sm text-warning">
                {it.text}
              </div>
            </div>
          )
        }
        return (
          <div key={it.id} className="flex justify-center">
            <div className="px-3 py-1 text-sm text-muted-foreground">{it.text}</div>
          </div>
        )
      })}
      {showThinking ? (
        <div className="flex justify-start" role="status" aria-label="Forge is thinking">
          <div className="px-4 py-2.5 text-sm text-muted-foreground">
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="animate-pulse">•</span>
              <span className="animate-pulse delay-150">•</span>
              <span className="animate-pulse delay-300">•</span>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
