import { z } from 'zod'

const positiveInt = (fallback: number) => z.coerce.number().int().positive().catch(fallback)

const envSchema = z.object({
  WORKER_NAME: z.string().min(1).catch('worker-1'),
  WORKER_CONCURRENCY: positiveInt(1),
  SESSION_MAX_STEPS: positiveInt(500),
  SESSION_WALL_CLOCK_MS: positiveInt(8 * 60 * 60 * 1000),
  SESSION_TOKEN_BUDGET_INPUT_TOKENS: z.coerce.number().int().positive().optional().catch(undefined),
  COMPACTION_ENABLED: z.enum(['true', 'false']).catch('true'),
  COMPACTION_RESERVE_TOKENS: positiveInt(16384),
  COMPACTION_KEEP_TOKENS: positiveInt(20000),
  SANDBOX_REAPER_INTERVAL_MS: positiveInt(60_000),
  SANDBOX_IDLE_TIMEOUT_MS: positiveInt(5 * 60 * 1000),
  OPENCODE_API_KEY: z.string().min(1),
})

export const env = envSchema.parse(process.env)
