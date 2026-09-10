import type { SandboxHandle } from 'sandbox'
import type { FileOps, LoopResult } from 'agent-core'
import type { ManagedSandbox } from '../../sandbox/manager.ts'

export const STORED_TOOL_OUTPUT_CHARS = 20000
export const RESUME_HISTORY_LIMIT = 200
export const RESUME_TOOL_OUTPUT_CHARS = 8000

export interface AgentLoopContext {
  sessionId: string
  prompt: string
  isAsk: boolean
  defaultBranch: string
  sandbox: SandboxHandle
  managedSandbox: ManagedSandbox
  authUrl: string
}

export interface AgentLoopOutcome {
  result: LoopResult
  commitRequested: boolean
}

export interface CompactionTracker {
  previousSummary: string | undefined
  cumulativeFileOps: FileOps
}
