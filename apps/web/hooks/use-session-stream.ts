'use client'

import { useEffect } from 'react'
import type {
  ChatItem,
  DiffFileMeta,
  PullRequestInfo,
  SessionEvent,
  SessionStatus,
  TerminalChunk,
  ToolCallData,
} from '@/lib/types'
import { cleanPrTitle } from '@/lib/session-chat'
import { parsePullRequestUrl } from '@/lib/pull-request'
import { sessionStreamUrl } from '@/lib/api'
import { ERROR_PREVIEW_LENGTH } from '@/lib/constants'

interface SessionStreamHandlers {
  setStatus: (status: SessionStatus) => void
  setIsThinking: (thinking: boolean) => void
  setItems: (updater: (previous: ChatItem[]) => ChatItem[]) => void
  setChunks: (updater: (previous: TerminalChunk[]) => TerminalChunk[]) => void
  setDiffFiles: (files: DiffFileMeta[]) => void
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
    let stream: { n: number; id: string } | null = null
    const toToolItem = (call: ToolCallData): ChatItem => ({
      id: `sse-${handlers.genId()}-${call.id}`,
      role: 'tool' as const,
      kind: 'tool_call' as const,
      toolCallId: call.id,
      toolName: call.name,
      toolInput: call.input,
    })
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
            // tell the sidebar so its running indicator stops
            window.dispatchEvent(
              new CustomEvent('forge:session-status', {
                detail: { sessionId, status: nextStatus },
              }),
            )
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
                  isError: nextStatus === 'FAILED',
                },
              ])
            }
            if (nextStatus === 'DONE' || nextStatus === 'FAILED') {
              es.close()
            }
            return
          }
          case 'step_delta': {
            if (!data.delta) return
            handlers.setIsThinking(true)
            const n = data.stepNumber ?? 0
            if (!stream || stream.n !== n) {
              const id = `sse-${handlers.genId()}-stream-${n}`
              stream = { n, id }
              const text = data.delta
              handlers.setItems((previous) => [
                ...previous,
                {
                  id,
                  role: 'assistant' as const,
                  kind: 'thought' as const,
                  isThinking: false,
                  stepNumber: n,
                  createdAt: new Date().toISOString(),
                  text,
                },
              ])
            } else {
              const delta = data.delta
              const id = stream.id
              handlers.setItems((previous) =>
                previous.map((item) =>
                  item.id === id ? { ...item, text: `${item.text ?? ''}${delta}` } : item,
                ),
              )
            }
            return
          }
          case 'step': {
            handlers.setIsThinking(true)
            const step = data.step
            if (!step) return
            if (stream && stream.n === data.stepNumber) {
              const provisional = stream.id
              stream = null
              const finalText = step.text ?? ''
              const toolCalls = step.toolCalls ?? []
              handlers.setItems((previous) => [
                ...previous.map((item) =>
                  item.id === provisional
                    ? {
                        ...item,
                        text: finalText || item.text,
                        isThinking: false,
                        durationMs: step.durationMs,
                      }
                    : item,
                ),
                ...toolCalls.map(toToolItem),
              ])
              return
            }
            handlers.setItems((previous) => [
              ...previous,
              ...(step.text
                ? [
                    {
                      id: `sse-${handlers.genId()}-thought`,
                      role: 'assistant' as const,
                      kind: 'thought' as const,
                      isThinking: false,
                      durationMs: step.durationMs,
                      createdAt: new Date().toISOString(),
                      text: step.text,
                    },
                  ]
                : []),
              ...(step.toolCalls ?? []).map(toToolItem),
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
            handlers.setDiffFiles(data.files)
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
                text:
                  data.compacted === false
                    ? 'Nothing new to compact'
                    : 'Context compacted, continuing with summary',
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
