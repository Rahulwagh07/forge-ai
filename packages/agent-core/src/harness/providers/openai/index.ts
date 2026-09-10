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
  parseToolCallArguments,
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

  async runStep(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    onToken?: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<ProviderResponse> {
    try {
      const stream = await withRetry(() =>
        this.client.chat.completions.create(
          {
            model: this.model,
            messages: messages.map(convertAgentMessage),
            tools: tools.length > 0 ? tools.map(convertToolDefinition) : undefined,
            stream: true,
            stream_options: { include_usage: true },
          },
          signal ? { signal } : undefined,
        ),
      )

      let text = ''
      let finishReason: string | null = null
      let usage: ProviderResponse['usage']
      const toolAcc = new Map<number, { id: string; name: string; args: string }>()

      for await (const chunk of stream) {
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          }
        }
        const choice = chunk.choices[0]
        if (!choice) continue
        if (choice.finish_reason) finishReason = choice.finish_reason
        const delta = choice.delta
        if (delta?.content) {
          text += delta.content
          onToken?.(delta.content)
        }
        for (const tc of delta?.tool_calls ?? []) {
          const prev = toolAcc.get(tc.index) ?? { id: '', name: '', args: '' }
          if (tc.id) prev.id = tc.id
          if (tc.function?.name) prev.name = tc.function.name
          if (tc.function?.arguments) prev.args += tc.function.arguments
          toolAcc.set(tc.index, prev)
        }
      }

      const toolCalls = [...toolAcc.values()]
        .filter((tc) => tc.id && tc.name)
        .map((tc) => ({
          id: tc.id,
          name: tc.name,
          input: parseToolCallArguments(tc.args),
        }))
      return {
        text: text || undefined,
        toolCalls,
        stopReason: convertFinishReason(finishReason),
        usage,
      }
    } catch (err) {
      if (signal?.aborted) throw err
      throw toProviderError(err)
    }
  }
}
