import type { SandboxHandle } from '@repo/sandbox'
import type { LoopResult } from '@repo/agent-core'

export interface AgentLoopContext {
  sessionId: string
  prompt: string
  askMode: boolean
  baseBranch: string
  sandbox: SandboxHandle
  authUrl: string
  signal: AbortSignal
}

export interface AgentLoopOutcome {
  result: LoopResult
  commitRequested: boolean
}

export interface SessionLoopState {
  commitRequested: boolean
  hasFetchedDiffBase: boolean
  latestStepNumber: number
  forceCompactionRequested: boolean
}
