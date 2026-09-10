import { z } from 'zod'

export const MAX_TEXT_LENGTH = 100_000

export const idParamSchema = z.object({
  id: z.string().min(1).max(64),
})
