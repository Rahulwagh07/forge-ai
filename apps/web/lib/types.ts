export type SessionStatus = 'QUEUED' | 'RUNNING' | 'AWAITING_INPUT' | 'PAUSED' | 'DONE' | 'FAILED'

export type ToolCallData = {
  id?: string
  name: string
  input: Record<string, unknown>
}

export type DiffFileStatus = 'created' | 'modified' | 'deleted' | 'renamed'

export type DiffFileMeta = {
  path: string
  status: DiffFileStatus
  previousPath?: string
  additions: number
  deletions: number
  binary?: boolean
  contentTooLarge?: boolean
}

export interface DiffFileContents {
  oldContent: string
  newContent: string
  contentTooLarge: boolean
  binary: boolean
}

export type DiffTotals = {
  files: number
  additions: number
  deletions: number
}

type StoredStepContent =
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
  | { type: 'step_delta'; stepNumber: number; delta: string }
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
  | {
      type: 'diff'
      files: DiffFileMeta[]
      totals: DiffTotals
    }
  | { type: 'branch_pushed'; branch: string }
  | { type: 'compaction'; stepNumber?: number; compacted?: boolean }
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
