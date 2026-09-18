import type { ProviderErrorCategory } from '../../provider.ts'
import { ProviderError, classifyProviderError } from '../../provider.ts'

function truncateErrorDetail(value: unknown, maxChars = 2000): string {
  try {
    const serialized = JSON.stringify(value)
    return serialized.length > maxChars ? `${serialized.slice(0, maxChars)}...` : serialized
  } catch {
    return String(value)
  }
}

export function toProviderError(sdkError: unknown): ProviderError {
  const record =
    typeof sdkError === 'object' && sdkError !== null ? (sdkError as Record<string, unknown>) : {}
  const classification = classifyProviderError(sdkError)
  const { status, codes } = classification
  const code = codes[0]
  const errorDetail =
    record.error !== undefined
      ? truncateErrorDetail(record.error)
      : sdkError instanceof Error
        ? (sdkError.message ?? String(sdkError))
        : String(sdkError)
  const message = `[agent-core] provider request failed (status ${status ?? '?'}): ${errorDetail}`

  let category: ProviderErrorCategory = 'unknown'
  if (classification.isContextOverflow) {
    category = 'context-overflow'
  } else if (classification.isRateLimit) {
    category = 'rate-limit'
  } else if (
    status === 401 ||
    status === 403 ||
    codes.some((code) => ['invalid_api_key', 'authentication_error'].includes(code.toLowerCase()))
  ) {
    category = 'auth'
  } else if (status !== undefined && status >= 500 && status < 600) {
    category = 'server'
  }
  return new ProviderError(category, message, status, code)
}
