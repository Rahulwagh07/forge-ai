import { OpenAIProvider } from './providers/openai.ts'
import type { LLMProvider } from './provider.ts'

export { OpenAIProvider }
export { runAgentLoop, SYSTEM_PROMPT, ASK_SYSTEM_PROMPT } from './loop.ts'
export type {
  LoopResult,
  LoopStepEvent,
  LoopToolOutputEvent,
  LoopToolResultEvent,
  RunLoopOptions,
} from './loop.ts'
export { TOOL_DEFINITIONS, executeToolCall } from './tools.ts'
export type { ToolOutcome } from './tools.ts'
export type {
  AgentMessage,
  LLMProvider,
  ProviderResponse,
  StopReason,
  ToolCall,
  ToolDefinition,
} from './provider.ts'

export function getProvider(name: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'): LLMProvider {
  switch (name) {
    case 'OPENAI':
      return new OpenAIProvider()
    case 'ANTHROPIC':
      throw new Error('[agent-core] not implemented')
    case 'GOOGLE':
      throw new Error('[agent-core] not implemented')
  }
}
