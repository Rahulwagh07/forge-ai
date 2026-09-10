import type { ReactNode } from 'react'
import { ThinkingBlock } from '@/components/workspace/chat/tool-row'
import type { ChatItem, PullRequestInfo } from '@/lib/types'
import { ThoughtBlock } from './thought-block'

function isNestedWork(item?: ChatItem): boolean {
  return item?.role === 'tool' || (item?.role === 'assistant' && Boolean(item.isThinking))
}

export function collectToolRun(items: ChatItem[], start: number): { run: ChatItem[]; end: number } {
  const run: ChatItem[] = []
  let end = start - 1
  while (items[end + 1]?.role === 'tool') {
    end += 1
    const tool = items[end]
    if (tool) run.push(tool)
  }
  return { run, end }
}

export function collectNestedWork(
  items: ChatItem[],
  index: number,
  prByRunStart: Map<number, PullRequestInfo>,
): { children: ReactNode[]; end: number } {
  const children: ReactNode[] = []
  let end = index
  while (isNestedWork(items[end + 1])) {
    const peek = items[end + 1]
    if (peek?.role === 'tool') {
      const runStart = end + 1
      const { run, end: runEnd } = collectToolRun(items, runStart)
      end = runEnd
      const pr = prByRunStart.get(runStart)
      children.push(
        <div key={run[0]?.id ?? `run-${runStart}`}>
          <ThinkingBlock items={run} additions={pr?.additions} deletions={pr?.deletions} nested />
        </div>,
      )
    } else if (peek) {
      end += 1
      children.push(<ThoughtBlock key={peek.id} item={peek} nested />)
    }
  }
  return { children, end }
}
