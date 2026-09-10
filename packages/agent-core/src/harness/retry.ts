import { ProviderError } from './provider.ts'

const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

const RETRYABLE_ERROR_NAMES = new Set(['APIConnectionError', 'APIConnectionTimeoutError'])

function readStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const status = (err as Record<string, unknown>).status
  return typeof status === 'number' ? status : undefined
}

function readCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const code = (err as Record<string, unknown>).code
  return typeof code === 'string' ? code : undefined
}

function isRetryableProviderError(err: unknown): boolean {
  if (err instanceof ProviderError) return err.retryable
  const status = readStatus(err)
  if (status !== undefined) return status === 429 || (status >= 500 && status < 600)
  if (err instanceof Error && RETRYABLE_ERROR_NAMES.has(err.name)) return true
  const code = readCode(err)
  return code !== undefined && RETRYABLE_NETWORK_CODES.has(code)
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseMs = 500,
  shouldRetry: (err: unknown) => boolean = isRetryableProviderError,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt >= retries || !shouldRetry(err)) throw err
      await new Promise((r) => setTimeout(r, baseMs * 2 ** attempt))
    }
  }
  throw lastErr
}
