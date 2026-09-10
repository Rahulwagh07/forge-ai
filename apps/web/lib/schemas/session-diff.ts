import { z } from 'zod'

export const diffQuerySchema = z.object({
  path: z.string().min(1).max(1024).optional(),
  contents: z.literal('1').optional(),
})
