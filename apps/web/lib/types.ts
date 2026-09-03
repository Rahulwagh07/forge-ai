export type SessionStatus = 'QUEUED' | 'RUNNING' | 'AWAITING_INPUT' | 'PAUSED' | 'DONE' | 'FAILED'

export type ToolCallData = {
  id?: string
  name: string
  input: Record<string, unknown>
}

export type StoredStepContent =
  | { message: string }
  | { text?: string; durationMs?: number; toolCalls?: ToolCallData[] }
  | {
      toolCallId?: string
      toolName?: string
      input?: Record<string, unknown>
      output?: string
      content?: string
      isError?: boolean
      durationMs?: number
    }
  | { diff: string }
  | { step: number }

export type StoredStep = {
  type: string
  content: StoredStepContent
  createdAt?: string
}

export type SessionEvent =
  | { type: 'init'; session: Record<string, unknown> }
  | { type: 'status'; status: SessionStatus; error?: string }
  | {
      type: 'step'
      step: {
        text?: string
        durationMs?: number
        toolCalls?: ToolCallData[]
      }
      stepNumber: number
    }
  | {
      type: 'tool_result'
      result: {
        toolCallId?: string
        toolName?: string
        input?: Record<string, unknown>
        output?: string
        isError?: boolean
        durationMs?: number
      }
    }
  | {
      type: 'terminal_output'
      output: {
        toolCallId?: string
        stream?: 'stdout' | 'stderr'
        data?: string
      }
    }
  | { type: 'diff'; diff: string; stepNumber?: number }
  | { type: 'branch_pushed'; branch: string }
  | {
      type: 'pr_created'
      prUrl: string
      branch?: string
      title?: string
      files?: number
      additions?: number
      deletions?: number
    }

export type ChatItem = {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  kind:
    | 'thought'
    | 'tool_call'
    | 'tool_result'
    | 'steering'
    | 'status'
    | 'sandbox_created'
    | 'branch_pushed'
    | 'pr_created'
    | 'event'
  text?: string
  toolName?: string
  toolCallId?: string
  toolInput?: Record<string, unknown>
  toolOutput?: string
  diff?: string
  pr?: PullRequestInfo
  durationMs?: number
  isThinking?: boolean
  isError?: boolean
  stepNumber?: number
  createdAt?: string
}

export type TerminalEntry = {
  id: string
  cmd: string
  output: string
}

export type TerminalChunk = {
  toolCallId: string
  stream: 'stdout' | 'stderr'
  data: string
}

export type PullRequestInfo = {
  url: string
  branch?: string | null
  title?: string
  files?: number
  additions?: number
  deletions?: number
  repoFullName?: string
  number?: number
  state?: 'open' | 'closed' | 'merged'
}
