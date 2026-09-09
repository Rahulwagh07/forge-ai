export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export type StopReason = 'tool_use' | 'end_turn' | 'max_tokens'

export interface ProviderUsage {
  inputTokens?: number
  outputTokens?: number
}

export interface ProviderResponse {
  text?: string
  toolCalls: ToolCall[]
  stopReason: StopReason
  usage?: ProviderUsage
}

export type AgentMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | {
      role: 'tool_result'
      toolCallId: string
      content: string
      isError?: boolean
    }

export interface LLMProvider {
  readonly contextWindow: number
  runStep(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    onToken?: (delta: string) => void,
  ): Promise<ProviderResponse>
}

export type ProviderErrorCategory =
  'context-overflow' | 'rate-limit' | 'auth' | 'server' | 'unknown'

export class ProviderError extends Error {
  readonly category: ProviderErrorCategory
  readonly status?: number
  readonly code?: string

  constructor(category: ProviderErrorCategory, message: string, status?: number, code?: string) {
    super(message)
    this.name = 'ProviderError'
    this.category = category
    if (status !== undefined) this.status = status
    if (code !== undefined) this.code = code
  }

  get retryable(): boolean {
    return this.category === 'rate-limit' || this.category === 'server'
  }
}

//TODO: Verify how provider SDKs represent context-length error
const OVERFLOW_FALLBACK_PATTERN =
  /context_length|maximum context|too many tokens|token limit|context window|out of context|prompt is too long|conversation too long|maximum prompt length|context size|prompt[^.]{0,50}tokens?[^.]{0,30}limit exceeded/i

const RATE_LIMIT_PATTERN =
  /rate.?limit|429|quota|resource_exhausted|temporarily unavailable|please retry|try again later/i

export function extractErrorCodes(err: unknown, depth = 0): string[] {
  if (depth > 3 || typeof err !== 'object' || err === null) return []
  const record = err as Record<string, unknown>
  const out: string[] = []
  for (const key of ['code', 'type'] as const) {
    const value = record[key]
    if (typeof value === 'string') out.push(value)
  }
  for (const key of ['error', 'cause', 'data'] as const) {
    const nested = record[key]
    if (typeof nested === 'string') out.push(...extractErrorCodes({ code: nested }, depth + 1))
    else if (typeof nested === 'object' && nested !== null)
      out.push(...extractErrorCodes(nested, depth + 1))
  }
  return out
}

export function isContextOverflowError(err: unknown): boolean {
  if (err instanceof ProviderError) return err.category === 'context-overflow'
  const codes = extractErrorCodes(err).join(' ').toLowerCase()
  if (codes.includes('context_length_exceeded')) return true
  if (/rate_limit|rate-limit|insufficient_quota|quota/.test(codes)) return false
  const msg = err instanceof Error ? err.message : String(err)
  if (RATE_LIMIT_PATTERN.test(msg)) return false
  return OVERFLOW_FALLBACK_PATTERN.test(msg)
}
