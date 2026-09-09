import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import type { AgentMessage, ProviderResponse, ToolDefinition } from '../../provider.ts'

export function convertAgentMessage(msg: AgentMessage): ChatCompletionMessageParam {
  switch (msg.role) {
    case 'system':
      return { role: 'system', content: msg.content }
    case 'user':
      return { role: 'user', content: msg.content }
    case 'assistant': {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: 'function' as const,
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.input),
            },
          })),
        }
      }
      return { role: 'assistant', content: msg.content }
    }
    case 'tool_result':
      return {
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: msg.isError ? `ERROR: ${msg.content}` : msg.content,
      }
  }
}

export function convertToolDefinition(def: ToolDefinition): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: def.inputSchema,
    },
  }
}

export function convertFinishReason(finishReason: string | null): ProviderResponse['stopReason'] {
  switch (finishReason) {
    case 'tool_calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    default:
      return 'end_turn'
  }
}

export function parseToolCallArguments(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
