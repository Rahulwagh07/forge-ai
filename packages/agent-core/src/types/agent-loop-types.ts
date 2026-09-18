import type { OutputChunk, SandboxHandle } from '@repo/sandbox'
import type { AgentMessage, LLMProvider, ProviderResponse, ToolCall } from '../harness/provider.ts'
import type { CompactionOptions, LoopCompactionState } from '../harness/compaction/index.ts'

export interface LoopStepEvent {
  stepNumber: number
  text?: string
  toolCalls?: ToolCall[]
  durationMs?: number
  stepUsage?: ProviderResponse['usage']
}

export interface LoopToolResultEvent {
  stepNumber: number
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  output: string
  isError: boolean
  durationMs?: number
}

export interface LoopToolOutputEvent extends OutputChunk {
  stepNumber: number
  toolCallId: string
  toolName: string
}

export interface LoopResult {
  steps: number
  stoppedBy:
    | 'finish_session'
    | 'no_tool_calls'
    | 'max_steps'
    | 'timeout'
    | 'token_budget'
    | 'max_tokens'
    | 'consecutive_errors'
    | 'aborted'
  finalText?: string
  approxTokens?: number
  compactions?: number
  totalUsage: NonNullable<ProviderResponse['usage']>
  toolCallCounts: Record<string, number>
}

export interface LoopContextSnapshot {
  stepNumber: number
}

export interface BeforeToolCallResult {
  blocked?: string
  input?: Record<string, unknown>
}

export interface AfterToolCallResult {
  output?: string
  isError?: boolean
}

export interface BeforeCompactArgs {
  messages: AgentMessage[]
  state: LoopCompactionState
  stepNumber: number
  force: boolean
  exactTokens?: number
}

export interface RunLoopOptions {
  provider: LLMProvider
  sandbox: SandboxHandle
  userPrompt: string
  systemPrompt?: string
  maxSteps: number
  maxWallClockMs?: number
  maxInputTokens?: number
  readOnly?: boolean
  onStep?: (event: LoopStepEvent) => void | Promise<void>
  onToken?: (event: { stepNumber: number; delta: string }) => void
  onToolOutput?: (event: LoopToolOutputEvent) => void
  onToolResult?: (event: LoopToolResultEvent) => void | Promise<void>
  getSteeringMessages?: () => string[] | Promise<string[]>
  initialMessages?: AgentMessage[]
  onContext?: (snapshot: LoopContextSnapshot) => void
  compaction?: CompactionOptions
  signal?: AbortSignal
  beforeToolCall?: (
    call: ToolCall,
  ) => BeforeToolCallResult | void | Promise<BeforeToolCallResult | void>
  afterToolCall?: (event: {
    call: ToolCall
    output: string
    isError: boolean
  }) => AfterToolCallResult | void | Promise<AfterToolCallResult | void>
  transformContext?: (
    messages: AgentMessage[],
    snapshot: LoopContextSnapshot,
  ) => void | Promise<void>
  beforeCompact?: (args: BeforeCompactArgs) => boolean | void | Promise<boolean | void>
}
