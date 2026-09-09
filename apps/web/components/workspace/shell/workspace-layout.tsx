'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PanelLeftIcon } from '@hugeicons/core-free-icons'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ActivityFeed } from '@/components/workspace/chat/activity-feed'
import { describeToolCall } from '@/lib/session-chat'
import { AgentDock } from '@/components/workspace/panels/agent-dock'
import { Composer } from '@/components/workspace/chat/composer'
import { initialChatItems, toTerminalEntries, withToolResults } from '@/lib/session-chat'
import { useSessionStream } from '@/hooks/use-session-stream'
import { retrySession, sendSteering, wakeSession } from '@/lib/api'
import { parsePullRequestUrl, type PrState } from '@/lib/pull-request'
import {
  DOCK_WIDTH_DEFAULT,
  DOCK_WIDTH_MAX,
  DOCK_WIDTH_MIN,
  TITLE_MAX_LENGTH,
  TITLE_TRUNCATE_LENGTH,
} from '@/lib/constants'
import type {
  ChatItem,
  DiffFileMeta,
  PullRequestInfo,
  SessionStatus,
  StoredStep,
  TerminalChunk,
} from '@/lib/types'

export function WorkspaceLayout({
  sessionId,
  initialSteps,
  initialStatus,
  initialPrompt,
  mode,
  initialBranchName,
  initialPrUrl,
  initialPrState,
  initialDiffFiles,
}: {
  sessionId: string
  initialSteps: StoredStep[]
  initialStatus: string
  initialPrompt?: string
  mode?: string
  initialBranchName?: string | null
  initialPrUrl?: string | null
  initialPrState?: PrState
  initialDiffFiles: DiffFileMeta[]
}) {
  const isAsk = (mode ?? 'AGENT') === 'ASK'
  const normalizedPrompt = initialPrompt?.trim().replace(/\s+/g, ' ')
  const fallbackTitle = normalizedPrompt
    ? normalizedPrompt.length > TITLE_MAX_LENGTH
      ? `${normalizedPrompt.slice(0, TITLE_TRUNCATE_LENGTH)}...`
      : normalizedPrompt
    : 'Agent changes'
  const initialPr = initialPrUrl
    ? {
        url: initialPrUrl,
        branch: initialBranchName,
        title: fallbackTitle,
        ...parsePullRequestUrl(initialPrUrl),
        state: initialPrState,
      }
    : undefined
  const initialItems = useMemo(
    () => initialChatItems(initialSteps, initialPrompt, initialPr),
    [initialSteps, initialPrompt, initialPrUrl, initialBranchName],
  )
  const [items, setItems] = useState<ChatItem[]>(initialItems)
  const [status, setStatus] = useState<SessionStatus>(initialStatus as SessionStatus)
  const [isThinking, setIsThinking] = useState(initialStatus === 'RUNNING')
  const [chunks, setChunks] = useState<TerminalChunk[]>([])
  const [diffFiles, setDiffFiles] = useState<DiffFileMeta[]>(initialDiffFiles)
  const [branchName, setBranchName] = useState(initialBranchName)
  const [pr, setPr] = useState<PullRequestInfo | undefined>(initialPr)
  const [dockWidth, setDockWidth] = useState(DOCK_WIDTH_DEFAULT)
  const [dockOpen, setDockOpen] = useState(true)
  const layoutRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)
  const idRef = useRef(0)
  const genId = () => `${Date.now()}-${idRef.current++}`
  const [streamReconnect, setStreamReconnect] = useState(0)

  useEffect(() => {
    setItems(initialItems)
    setStatus(initialStatus as SessionStatus)
  }, [initialItems, initialStatus])

  useSessionStream(
    sessionId,
    {
      setStatus,
      setIsThinking,
      setItems,
      setChunks,
      setDiffFiles,
      setBranchName,
      setPr,
      branchName,
      genId,
    },
    streamReconnect,
  )

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!resizingRef.current) return
      const bounds = layoutRef.current?.getBoundingClientRect()
      if (!bounds) return
      const next = ((bounds.right - event.clientX) / bounds.width) * 100
      setDockWidth(Math.min(DOCK_WIDTH_MAX, Math.max(DOCK_WIDTH_MIN, next)))
    }
    const stop = () => {
      resizingRef.current = false
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [])

  const chatItems = useMemo(() => {
    const result = withToolResults(items)
    if (pr && !result.some((item) => item.kind === 'pr_created'))
      result.push({
        id: 'pr-latest',
        role: 'system',
        kind: 'pr_created',
        text: 'Pull request created',
        pr,
      })
    return result
  }, [items, pr])
  const terminalEntries = useMemo(() => toTerminalEntries(chatItems, chunks), [chatItems, chunks])
  const fileCount = diffFiles.length
  const waitingOnUser = status === 'AWAITING_INPUT' || status === 'PAUSED'
  const currentAction = useMemo(() => {
    for (let i = chatItems.length - 1; i >= 0; i -= 1) {
      const item = chatItems[i]
      if (item?.kind === 'tool_call') return describeToolCall(item)
      if (item?.role === 'assistant' || item?.role === 'user') break
    }
    return undefined
  }, [chatItems])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatItems.length])

  async function handleSend(message: string) {
    setItems((previous) => [
      ...previous,
      {
        id: `local-${genId()}`,
        role: 'user',
        kind: 'steering',
        text: message,
        createdAt: new Date().toISOString(),
      },
    ])
    setIsThinking(true)
    try {
      await sendSteering(sessionId, message)
      // A follow-up on a completed session requeues it; reopen the SSE stream
      // so the resumed run's events show up live
      if (!isAsk && (status === 'DONE' || status === 'FAILED')) {
        setStatus('QUEUED')
        setStreamReconnect((k) => k + 1)
      }
    } catch (error) {
      setIsThinking(false)
      throw error
    }
  }

  async function handleRetry() {
    await retrySession(sessionId)
    setStatus('QUEUED')
    setStreamReconnect((k) => k + 1)
  }

  async function handleWake() {
    await wakeSession(sessionId)
    setStatus('QUEUED')
    setStreamReconnect((k) => k + 1)
  }

  const statusText =
    status === 'QUEUED'
      ? 'Waking up Forge...'
      : status === 'RUNNING'
        ? currentAction
          ? `${currentAction}...`
          : 'Forge is working...'
        : status === 'AWAITING_INPUT' || status === 'PAUSED'
          ? 'Forge is waiting on you — reply above to continue'
          : status === 'DONE'
            ? 'Work completed'
            : status === 'FAILED'
              ? 'Forge hit an error — tell it how to proceed, or retry'
              : ''
  const dotClass =
    status === 'RUNNING'
      ? 'animate-pulse bg-success'
      : status === 'FAILED'
        ? 'bg-danger'
        : status === 'DONE'
          ? 'bg-success'
          : 'bg-muted-foreground'

  if (isAsk) {
    return (
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0 overflow-y-auto">
          <ActivityFeed
            items={chatItems}
            showThinking={isThinking}
            currentAction={currentAction}
            waitingOnUser={waitingOnUser}
            onWake={handleWake}
          />
          <div ref={bottomRef} className="h-36" />
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 p-3">
          <div className="mx-auto w-full max-w-3xl">
            <Composer
              status={status}
              onSend={handleSend}
              allowCompleted
              placeholder="Ask a question"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={layoutRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!dockOpen ? (
            <button
              type="button"
              onClick={() => setDockOpen(true)}
              className="absolute right-3 top-3 z-10 hidden rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:block"
              aria-label="Open terminal"
              title="Open terminal"
            >
              <HugeiconsIcon icon={PanelLeftIcon} size={16} />
            </button>
          ) : null}
          <ScrollArea className="min-h-0 flex-1 chat-scroll">
            <ActivityFeed
              items={chatItems}
              showThinking={isThinking}
              currentAction={currentAction}
              waitingOnUser={waitingOnUser}
              onWake={handleWake}
            />
            <div ref={bottomRef} />
          </ScrollArea>
          {waitingOnUser || status === 'DONE' ? null : (
            <div className="flex shrink-0 items-center">
              <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 pb-1">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
                <span className="truncate text-sm text-muted-foreground">{statusText}</span>
                {status === 'FAILED' ? (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="rounded-md bg-secondary px-2.5 py-1 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
                  >
                    Retry session
                  </button>
                ) : null}
              </div>
            </div>
          )}
          <div className="shrink-0 pb-3">
            <div className="mx-auto w-full max-w-3xl px-4">
              <Composer status={status} onSend={handleSend} allowCompleted />
            </div>
          </div>
        </div>
        {dockOpen ? (
          <>
            <div
              className="hidden w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 lg:block"
              onPointerDown={() => {
                resizingRef.current = true
              }}
              aria-label="Resize terminal panel"
            />
            <div
              className="hidden min-h-0 w-full flex-col lg:flex lg:h-full lg:w-(--dock-width)"
              style={{ '--dock-width': `${dockWidth}%` } as React.CSSProperties}
            >
              <AgentDock
                entries={terminalEntries}
                sessionId={sessionId}
                diffFiles={diffFiles}
                fileCount={fileCount}
                onClose={() => setDockOpen(false)}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
