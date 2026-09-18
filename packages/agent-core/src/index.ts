export { OpenCodeProvider } from './harness/providers/opencode/provider.ts'
export { runAgentLoop } from './agent-loop.ts'
export { SYSTEM_PROMPT } from './harness/prompts/system.ts'
export { ASK_SYSTEM_PROMPT } from './harness/prompts/ask.ts'
export { COMPACTION_PROMPT } from './harness/prompts/compaction.ts'
export { serializeConversation, mergeFileOps } from './harness/compaction/context.ts'
export { createCompactionState, tryCompactLoop } from './harness/compaction/index.ts'
export { truncateToolOutput } from './harness/tools/executor.ts'
export type { CompactionOptions, LoopCompactionState } from './harness/compaction/index.ts'
export type {
  LoopContextSnapshot,
  LoopResult,
  LoopStepEvent,
  LoopToolOutputEvent,
  LoopToolResultEvent,
  RunLoopOptions,
} from './agent-loop.ts'
export type {
  AgentMessage,
  LLMProvider,
  ProviderResponse,
  ProviderUsage,
  ToolCall,
  ToolDefinition,
} from './harness/provider.ts'
export type { FileOps } from './harness/compaction/context.ts'
export type { CredentialInput } from './harness/providers/opencode/provider.ts'
