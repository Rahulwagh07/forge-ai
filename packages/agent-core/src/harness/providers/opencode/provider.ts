import OpenAI from 'openai'
import { withRetry } from '../../retry.ts'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_PROVIDER_MAX_RETRIES,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  OPENCODE_GO_BASE_URL,
  OPENCODE_GO_DEFAULT_MODEL,
} from '../../../constants.ts'
import type { AgentMessage, LLMProvider, ProviderResponse, ToolDefinition } from '../../provider.ts'
import { toProviderError } from './errors.ts'
import {
  convertAgentMessage,
  convertFinishReason,
  convertToolDefinition,
  parseToolCallArguments,
} from './mapping.ts'

export interface CredentialInput {
  OPENCODE_API_KEY?: string
}

export class OpenCodeProvider implements LLMProvider {
  private readonly client: OpenAI
  private readonly maxRetries: number
  readonly modelId: string
  readonly contextWindow: number

  constructor(opts: {
    credentials: CredentialInput
    timeoutMs?: number
    maxRetries?: number
    sessionId?: string
  }) {
    const apiKey = opts.credentials.OPENCODE_API_KEY
    if (!apiKey) throw new Error('[agent-core] no LLM credentials: set OPENCODE_API_KEY')
    this.client = new OpenAI({
      apiKey,
      baseURL: OPENCODE_GO_BASE_URL,
      timeout: opts.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
      maxRetries: 0,
      defaultHeaders:
        opts.sessionId !== undefined
          ? {
              'x-opencode-session': opts.sessionId,
              'User-Agent': 'forge-worker/1.0',
            }
          : undefined,
    })
    this.maxRetries = opts.maxRetries ?? DEFAULT_PROVIDER_MAX_RETRIES
    this.modelId = OPENCODE_GO_DEFAULT_MODEL
    this.contextWindow = DEFAULT_CONTEXT_WINDOW
  }

  async runStep(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    onToken?: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<ProviderResponse> {
    try {
      const attempt = await withRetry(async () => {
        const stream = await this.client.chat.completions.create(
          {
            model: this.modelId,
            messages: messages.map(convertAgentMessage),
            tools: tools.length > 0 ? tools.map(convertToolDefinition) : undefined,
            stream: true,
            stream_options: { include_usage: true },
          },
          signal ? { signal } : undefined,
        )
        let text = ''
        let finishReason: string | null = null
        let usage: ProviderResponse['usage']
        const deltas: string[] = []
        const toolAcc = new Map<number, { id: string; name: string; args: string }>()

        for await (const chunk of stream) {
          if (chunk.usage) {
            usage = {
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
              cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens,
            }
          }
          const choice = chunk.choices[0]
          if (!choice) continue
          if (choice.finish_reason) finishReason = choice.finish_reason
          const delta = choice.delta
          if (delta?.content) {
            text += delta.content
            deltas.push(delta.content)
          }
          for (const tc of delta?.tool_calls ?? []) {
            const prev = toolAcc.get(tc.index) ?? { id: '', name: '', args: '' }
            if (tc.id) prev.id = tc.id
            if (tc.function?.name) prev.name = tc.function.name
            if (tc.function?.arguments) prev.args += tc.function.arguments
            toolAcc.set(tc.index, prev)
          }
        }

        return {
          text,
          finishReason,
          usage,
          deltas,
          toolCalls: [...toolAcc.values()]
            .filter((tc) => tc.id && tc.name)
            .map((tc) => ({
              id: tc.id,
              name: tc.name,
              input: parseToolCallArguments(tc.args),
            })),
        }
      }, this.maxRetries)
      for (const delta of attempt.deltas) onToken?.(delta)
      return {
        text: attempt.text || undefined,
        toolCalls: attempt.toolCalls,
        stopReason: convertFinishReason(attempt.finishReason),
        usage: attempt.usage,
      }
    } catch (err) {
      if (signal?.aborted) throw err
      throw toProviderError(err)
    }
  }
}
