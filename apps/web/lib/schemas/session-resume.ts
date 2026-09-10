import { z } from 'zod'

export const resumeSchema = z.object({
  action: z.enum(['wake']),
})
