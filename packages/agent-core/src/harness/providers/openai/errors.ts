import type { ProviderErrorCategory } from '../../provider.ts'
import { ProviderError, extractErrorCodes } from '../../provider.ts'

function extractStatus(sdkError: unknown, depth = 0): number | undefined {
  if (depth > 3 || typeof sdkError !== 'object' || sdkError === null) return undefined
  const record = sdkError as Record<string, unknown>
  if (typeof record.status === 'number') return record.status
  for (const key of ['error', 'cause', 'data'] as const) {
    const nested = record[key]
    if (typeof nested === 'object' && nested !== null) {
      const found = extractStatus(nested, depth + 1)
      if (found !== undefined) return found
    }
  }
  return undefined
}

function truncateErrorDetail(value: unknown, maxChars = 2000): string {
  try {
    const serialized = JSON.stringify(value)
    return serialized.length > maxChars ? `${serialized.slice(0, maxChars)}...` : serialized
  } catch {
    return String(value)
  }
}

const OVERFLOW_CODES = new Set(['context_length_exceeded'])
const RATE_LIMIT_CODES = new Set([
  'rate_limit_exceeded',
  'rate_limit_error',
  'insufficient_quota',
  'quota_exceeded',
])

const PROMPT_LIMIT_PATTERN = /prompt[^.]{0,50}tokens?[^.]{0,30}limit exceeded/i

export function toProviderError(sdkError: unknown): ProviderError {
  const record =
    typeof sdkError === 'object' && sdkError !== null ? (sdkError as Record<string, unknown>) : {}
  const status = extractStatus(sdkError)
  const codes = extractErrorCodes(sdkError)
  const code = codes[0]
  const errorDetail =
    record.error !== undefined
      ? truncateErrorDetail(record.error)
      : sdkError instanceof Error
        ? (sdkError.message ?? String(sdkError))
        : String(sdkError)
  const message = `[agent-core] provider request failed (status ${status ?? '?'}): ${errorDetail}`

  let category: ProviderErrorCategory = 'unknown'
  if (codes.some((c) => OVERFLOW_CODES.has(c))) {
    category = 'context-overflow'
  } else if (status === 402 && PROMPT_LIMIT_PATTERN.test(errorDetail)) {
    category = 'context-overflow'
  } else if (status === 429 || codes.some((c) => RATE_LIMIT_CODES.has(c))) {
    category = 'rate-limit'
  } else if (
    status === 401 ||
    status === 403 ||
    codes.includes('invalid_api_key') ||
    codes.includes('authentication_error')
  ) {
    category = 'auth'
  } else if (status !== undefined && status >= 500 && status < 600) {
    category = 'server'
  }
  return new ProviderError(category, message, status, code)
}
