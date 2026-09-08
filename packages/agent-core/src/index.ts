import { OpenAIProvider } from './harness/providers/openai/index.ts'
import type { LLMProvider } from './harness/provider.ts'
import type { CredentialInput } from './harness/providers/openai/config.ts'

export { OpenAIProvider }
export { resolveApiCredentials } from './harness/providers/openai/config.ts'
export type { CredentialInput } from './harness/providers/openai/config.ts'
export {
  runAgentLoop,
  SYSTEM_PROMPT,
  ASK_SYSTEM_PROMPT,
  isContextOverflowError,
} from './agent-loop.ts'
export type {
  LoopResult,
  LoopStepEvent,
  LoopToolOutputEvent,
  LoopToolResultEvent,
  RunLoopOptions,
  ContextSnapshot,
} from './agent-loop.ts'
export {
  serializeConversation,
  findRecentStart,
  extractFileOps,
  mergeFileOps,
  COMPACTION_PROMPT,
  estimateMessagesTokens,
  assertSafePath,
  blockedCommandReason,
  isRetryableProviderError,
  withRetry,
  ProviderError,
} from './harness/index.ts'
export type { FileOps, ProviderErrorCategory } from './harness/index.ts'
export { TOOL_DEFINITIONS, executeToolCall, truncateToolOutput } from './harness/tools/index.ts'
export type { ToolOutcome } from './harness/tools/index.ts'
export type {
  AgentMessage,
  LLMProvider,
  ProviderResponse,
  ProviderUsage,
  StopReason,
  ToolCall,
  ToolDefinition,
} from './harness/provider.ts'

export function getProvider(
  name: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE',
  credentials: CredentialInput,
  sessionId?: string,
): LLMProvider {
  switch (name) {
    case 'OPENAI':
      return new OpenAIProvider({ credentials, sessionId })
    case 'ANTHROPIC':
      throw new Error('[agent-core] not implemented')
    case 'GOOGLE':
      throw new Error('[agent-core] not implemented')
  }
}
