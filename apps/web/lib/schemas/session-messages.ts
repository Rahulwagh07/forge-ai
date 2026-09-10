import { z } from 'zod'
import { MAX_TEXT_LENGTH } from './common'

export const steerMessageSchema = z.object({
  message: z.string().min(1).max(MAX_TEXT_LENGTH),
})
