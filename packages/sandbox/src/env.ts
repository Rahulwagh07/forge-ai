import { z } from 'zod'

const positiveInt = (fallback: number) => z.coerce.number().int().positive().catch(fallback)

const envSchema = z.object({
  SANDBOX_PROVIDER: z.string().catch('docker'),
  SANDBOX_IMAGE: z.string().min(1).catch('forge-sandbox:latest'),
  SANDBOX_MEMORY_BYTES: positiveInt(2 * 1024 ** 3),
  // 1e9 NanoCpus = 1 CPU
  SANDBOX_NANOCPUS: positiveInt(1_000_000_000),
})

export const env = envSchema.parse(process.env)
