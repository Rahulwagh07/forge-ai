import OpenAI from 'openai'
import { withRetry } from '../../retry.ts'
import { DEFAULT_OPENAI_MAX_RETRIES, DEFAULT_OPENAI_TIMEOUT_MS } from '../../../constants.ts'
import type { AgentMessage, LLMProvider, ProviderResponse, ToolDefinition } from '../../provider.ts'
import { resolveApiCredentials, type CredentialInput } from './config.ts'
import { resolveContextWindow } from './models.ts'
import { toProviderError } from './errors.ts'
import {
  convertAgentMessage,
  convertFinishReason,
  convertToolDefinition,
  extractToolCalls,
} from './mapping.ts'

export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI
  private readonly model: string
  readonly contextWindow: number

  constructor(opts: {
    credentials: CredentialInput
    model?: string
    timeoutMs?: number
    maxRetries?: number
    sessionId?: string
  }) {
    const resolved = resolveApiCredentials(opts.model, opts.credentials)
    this.client = new OpenAI({
      apiKey: resolved.apiKey,
      baseURL: resolved.baseURL,
      timeout: opts.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS,
      maxRetries: opts.maxRetries ?? DEFAULT_OPENAI_MAX_RETRIES,
      defaultHeaders:
        opts.sessionId !== undefined
          ? {
              'x-opencode-session': opts.sessionId,
              'User-Agent': 'forge-worker/1.0',
            }
          : undefined,
    })
    this.model = opts.model ?? resolved.model
    this.contextWindow = resolveContextWindow(this.model)
  }

  async runStep(messages: AgentMessage[], tools: ToolDefinition[]): Promise<ProviderResponse> {
    try {
      const response = await withRetry(() =>
        this.client.chat.completions.create({
          model: this.model,
          messages: messages.map(convertAgentMessage),
          tools: tools.length > 0 ? tools.map(convertToolDefinition) : undefined,
        }),
      )

      const choice = response.choices[0]
      if (!choice) {
        throw new Error('[agent-core] OpenAI returned no choices')
      }

      const message = choice.message
      return {
        text: message.content ?? undefined,
        toolCalls: extractToolCalls(message),
        stopReason: convertFinishReason(choice.finish_reason),
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            }
          : undefined,
      }
    } catch (err) {
      throw toProviderError(err)
    }
  }
}
