import OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import type {
  AgentMessage,
  LLMProvider,
  ProviderResponse,
  ToolCall,
  ToolDefinition,
} from '../provider.ts'
import {
  DEFAULT_OPENAI_MODEL,
  OPENROUTER_BASE_URL,
  OPENROUTER_DEFAULT_MODEL,
} from '../constants.ts'

interface ResolvedConfig {
  apiKey: string
  baseURL?: string
  model: string
}

function resolveConfig(): ResolvedConfig {
  const explicitBase = process.env.OPENAI_BASE_URL
  const model = process.env.OPENAI_MODEL

  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: explicitBase,
      model: model ?? DEFAULT_OPENAI_MODEL,
    }
  }

  if (process.env.OPENROUTER_API_KEY) {
    return {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: explicitBase ?? OPENROUTER_BASE_URL,
      model: model ?? OPENROUTER_DEFAULT_MODEL,
    }
  }

  throw new Error('[agent-core] no LLM credentials: set OPENAI_API_KEY or OPENROUTER_API_KEY')
}

export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI
  private readonly model: string

  constructor(opts: { apiKey?: string; baseURL?: string; model?: string } = {}) {
    const resolved = resolveConfig()
    this.client = new OpenAI({
      apiKey: opts.apiKey ?? resolved.apiKey,
      baseURL: opts.baseURL ?? resolved.baseURL,
    })
    this.model = opts.model ?? resolved.model
  }

  async runStep(messages: AgentMessage[], tools: ToolDefinition[]): Promise<ProviderResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map(toOpenAIMessage),
      tools: tools.length > 0 ? tools.map(toOpenAITool) : undefined,
    })

    const choice = response.choices[0]
    if (!choice) {
      throw new Error('[agent-core] OpenAI returned no choices')
    }

    const message = choice.message
    const toolCalls: ToolCall[] = (message.tool_calls ?? [])
      .filter((tc) => tc.type === 'function')
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: safeParseArgs(tc.function.arguments),
      }))

    return {
      text: message.content ?? undefined,
      toolCalls,
      stopReason: mapStopReason(choice.finish_reason),
    }
  }
}

function toOpenAIMessage(msg: AgentMessage): ChatCompletionMessageParam {
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
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
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

function toOpenAITool(def: ToolDefinition): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: def.inputSchema,
    },
  }
}

function safeParseArgs(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function mapStopReason(finishReason: string | null): ProviderResponse['stopReason'] {
  switch (finishReason) {
    case 'tool_calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    default:
      return 'end_turn'
  }
}
