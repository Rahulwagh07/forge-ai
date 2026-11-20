import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'

const WEB_ENV_PATH = fileURLToPath(new URL('../../apps/web/.env', import.meta.url))
const WORKER_ENV_PATH = fileURLToPath(new URL('../../apps/worker/.env', import.meta.url))

config({ path: WEB_ENV_PATH, quiet: true })
config({ path: WORKER_ENV_PATH, quiet: true })

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback
}

export const BASE_URL = 'http://localhost:3000'
export const TEST_USER_EMAIL = 'rahulwagh3774@gmail.com'
export const TEST_USER_NAME = optional('E2E_USER_NAME', 'Rahul')
export const TEST_USER_ID = optional('E2E_USER_ID', 'cmtsbju8z0000p0tzz5jzk2dc')
export const TEST_USER_GOOGLE_ID = optional('E2E_USER_GOOGLE_ID', '112825390538944773071')
export const TEST_REPO_FULL_NAME = 'Rahulwagh07/perps-v1'
export const PROMPT_PREFIX = '[e2e]'
export const README_HEADING = 'backpack-depth-indexer'
export const SESSION_COOKIE_NAME = 'authjs.session-token'
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 2
export const WORKER_READY_TIMEOUT_MS = 30_000
export const WORKER_STOP_TIMEOUT_MS = 15_000
export const SESSION_TIMEOUT_MS = 180_000
export const ASK_SESSION_TIMEOUT_MS = 120_000
export const SESSION_SETTLE_TIMEOUT_MS = 60_000
export const MAX_PROMPT_LENGTH = 100_000
export const STORAGE_STATE_PATH = fileURLToPath(new URL('../.run/auth.json', import.meta.url))
export const NEXTAUTH_SECRET = required('NEXTAUTH_SECRET')
