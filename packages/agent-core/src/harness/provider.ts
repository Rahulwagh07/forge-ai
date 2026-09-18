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

type StopReason = 'tool_use' | 'end_turn' | 'max_tokens'

export interface ProviderUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
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
    signal?: AbortSignal,
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

const OVERFLOW_CODES = new Set(['context_length_exceeded'])
const RATE_LIMIT_CODES = new Set([
  'rate_limit_exceeded',
  'rate_limit_error',
  'insufficient_quota',
  'quota_exceeded',
])
const OVERFLOW_PATTERN =
  /context_length|maximum context|too many tokens|token limit|context window|out of context|prompt is too long|conversation too long|maximum prompt length|context size|prompt[^.]{0,50}tokens?[^.]{0,30}limit exceeded/i
const RATE_LIMIT_PATTERN =
  /rate.?limit|429|quota|resource_exhausted|temporarily unavailable|please retry|try again later/i

interface ErrorDetails {
  codes: string[]
  status?: number
}

function inspectError(
  err: unknown,
  depth = 0,
  details: ErrorDetails = { codes: [] },
): ErrorDetails {
  if (depth > 3 || typeof err !== 'object' || err === null) return details
  const record = err as Record<string, unknown>
  if (details.status === undefined && typeof record.status === 'number') {
    details.status = record.status
  }
  for (const key of ['code', 'type'] as const) {
    const value = record[key]
    if (typeof value === 'string') details.codes.push(value)
  }
  for (const key of ['error', 'cause', 'data'] as const) {
    const nested = record[key]
    if (typeof nested === 'string') details.codes.push(nested)
    else if (typeof nested === 'object' && nested !== null) inspectError(nested, depth + 1, details)
  }
  return details
}

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : ''
  if (typeof err !== 'object' || err === null) return `${message} ${String(err)}`
  try {
    return `${message} ${JSON.stringify(err)}`
  } catch {
    return message
  }
}

export function classifyProviderError(err: unknown): {
  codes: string[]
  status?: number
  isContextOverflow: boolean
  isRateLimit: boolean
} {
  if (err instanceof ProviderError) {
    return {
      codes: err.code ? [err.code] : [],
      status: err.status,
      isContextOverflow: err.category === 'context-overflow',
      isRateLimit: err.category === 'rate-limit',
    }
  }
  const details = inspectError(err)
  const codes = details.codes.map((code) => code.toLowerCase())
  const isRateLimit =
    details.status === 429 ||
    codes.some((code) => RATE_LIMIT_CODES.has(code)) ||
    RATE_LIMIT_PATTERN.test(errorText(err))
  return {
    codes: details.codes,
    status: details.status,
    isContextOverflow:
      codes.some((code) => OVERFLOW_CODES.has(code)) ||
      (!isRateLimit && OVERFLOW_PATTERN.test(errorText(err))),
    isRateLimit,
  }
}

export function isContextOverflowError(err: unknown): boolean {
  return classifyProviderError(err).isContextOverflow
}
