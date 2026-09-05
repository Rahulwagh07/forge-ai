import { z } from 'zod'

const positiveInt = (fallback: number) => z.coerce.number().int().positive().catch(fallback)

const envSchema = z
  .object({
    WORKER_NAME: z.string().min(1).catch('worker-1'),
    WORKER_CONCURRENCY: positiveInt(1),
    SESSION_MAX_STEPS: positiveInt(500),
    SESSION_WALL_CLOCK_MS: positiveInt(8 * 60 * 60 * 1000),
    COMPACTION_ENABLED: z.enum(['true', 'false']).catch('true'),
    COMPACTION_RESERVE_TOKENS: positiveInt(16384),
    COMPACTION_KEEP_TOKENS: positiveInt(20000),
    SANDBOX_REAPER_INTERVAL_MS: positiveInt(60_000),
    SANDBOX_IDLE_TIMEOUT_MS: positiveInt(5 * 60 * 1000),
    GIT_AUTHOR_NAME: z.string().optional(),
    SANDBOX_GIT_NAME: z.string().optional(),
    GIT_AUTHOR_EMAIL: z.string().optional(),
    SANDBOX_GIT_EMAIL: z.string().optional(),
    GIT_COMMITTER_NAME: z.string().optional(),
    GIT_COMMITTER_EMAIL: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
  })
  .refine((d) => d.OPENAI_API_KEY || d.OPENROUTER_API_KEY, {
    message: 'worker requires OPENAI_API_KEY or OPENROUTER_API_KEY',
  })

export const env = envSchema.parse(process.env)
