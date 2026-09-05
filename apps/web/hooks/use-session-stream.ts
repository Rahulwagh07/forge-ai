'use client'

import { useEffect } from 'react'
import type {
  ChatItem,
  PullRequestInfo,
  SessionEvent,
  SessionStatus,
  TerminalChunk,
} from '@/lib/types'
import { cleanPrTitle } from '@/lib/session-chat'
import { parsePullRequestUrl } from '@/lib/pull-request'
import { sessionStreamUrl } from '@/lib/api'
import { ERROR_PREVIEW_LENGTH } from '@/lib/constants'

export interface SessionStreamHandlers {
  setStatus: (status: SessionStatus) => void
  setIsThinking: (thinking: boolean) => void
  setItems: (updater: (previous: ChatItem[]) => ChatItem[]) => void
  setChunks: (updater: (previous: TerminalChunk[]) => TerminalChunk[]) => void
  setBranchName: (branch: string | null | undefined) => void
  setPr: (pr: PullRequestInfo | undefined) => void
  branchName: string | null | undefined
  genId: () => string
}

export function useSessionStream(
  sessionId: string,
  handlers: SessionStreamHandlers,
  reconnectKey = 0,
): void {
  useEffect(() => {
    const es = new EventSource(sessionStreamUrl(sessionId))
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SessionEvent
        switch (data.type) {
          case 'init':
            return
          case 'status': {
            const nextStatus = data.status
            handlers.setStatus(nextStatus)
            handlers.setIsThinking(nextStatus === 'RUNNING')
            const error = data.error ?? ''
            if (
              (nextStatus === 'FAILED' ||
                nextStatus === 'DONE' ||
                nextStatus === 'AWAITING_INPUT') &&
              error
            ) {
              handlers.setItems((previous) => [
                ...previous,
                {
                  id: `sse-${handlers.genId()}`,
                  role: 'system',
                  kind: 'status',
                  text: error.slice(0, ERROR_PREVIEW_LENGTH),
                },
              ])
            }
            if (nextStatus === 'DONE' || nextStatus === 'FAILED') {
              es.close()
            }
            return
          }
          case 'step': {
            handlers.setIsThinking(true)
            const step = data.step
            if (!step) return
            handlers.setItems((previous) => [
              ...previous,
              ...(step.text
                ? [
                    {
                      id: `sse-${handlers.genId()}-thought`,
                      role: 'assistant' as const,
                      kind: 'thought' as const,
                      isThinking: Boolean(step.toolCalls?.length),
                      durationMs: step.durationMs,
                      text: step.text,
                    },
                  ]
                : []),
              ...(step.toolCalls ?? []).map((call) => ({
                id: `sse-${handlers.genId()}-${call.id}`,
                role: 'tool' as const,
                kind: 'tool_call' as const,
                toolCallId: call.id,
                toolName: call.name,
                toolInput: call.input,
              })),
            ])
            return
          }
          case 'tool_result': {
            const result = data.result
            if (!result) return
            handlers.setItems((previous) => [
              ...previous,
              {
                id: `sse-${handlers.genId()}-result`,
                role: 'tool',
                kind: 'tool_result',
                toolCallId: result.toolCallId,
                toolName: result.toolName,
                toolInput: result.input,
                toolOutput: result.output ?? '',
                isError: result.isError,
                durationMs: result.durationMs,
              },
            ])
            return
          }
          case 'terminal_output': {
            const output = data.output
            if (output?.toolCallId && output.data)
              handlers.setChunks((previous) => [
                ...previous,
                {
                  toolCallId: output.toolCallId!,
                  stream: output.stream ?? 'stdout',
                  data: output.data!,
                },
              ])
            return
          }
          case 'diff':
            handlers.setItems((previous) => [
              ...previous,
              {
                id: `sse-${handlers.genId()}-diff`,
                role: 'system',
                kind: 'event',
                diff: data.diff,
                diffFiles: data.files,
                diffTruncated: data.truncated,
              },
            ])
            return
          case 'branch_pushed':
            if (data.branch) handlers.setBranchName(data.branch)
            return
          case 'compaction':
            handlers.setItems((previous) => [
              ...previous,
              {
                id: `sse-${handlers.genId()}-compaction`,
                role: 'system',
                kind: 'status',
                text: 'Context compacted, continuing with summary',
              },
            ])
            return
          case 'pr_created': {
            const nextPr: PullRequestInfo = {
              url: data.prUrl,
              branch: data.branch ?? handlers.branchName,
              title: data.title ? cleanPrTitle(data.title) : undefined,
              ...parsePullRequestUrl(data.prUrl),
              state: 'open',
              files: data.files,
              additions: data.additions,
              deletions: data.deletions,
            }
            handlers.setPr(nextPr)
            handlers.setItems((previous) => [
              ...previous,
              {
                id: `sse-${handlers.genId()}-pr`,
                role: 'system',
                kind: 'pr_created',
                text: 'Pull request created',
                pr: nextPr,
              },
            ])
            return
          }
        }
      } catch {
        // Ignore malformed events
      }
    }
    return () => es.close()
    // reconnectKey lets callers reopen the stream (e.g. after a follow-up on a
    // completed session that the worker has requeued)
  }, [sessionId, reconnectKey])
}
