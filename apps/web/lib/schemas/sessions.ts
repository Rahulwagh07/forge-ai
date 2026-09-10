import { z } from 'zod'
import { isValidBranchName } from '../utils'
import { MAX_TEXT_LENGTH } from './common'

export const createSessionSchema = z.object({
  repoId: z.string().min(1).max(64),
  prompt: z.string().min(1).max(MAX_TEXT_LENGTH),
  provider: z.enum(['ANTHROPIC', 'OPENAI', 'GOOGLE']).default('OPENAI'),
  mode: z.enum(['ASK', 'AGENT']).default('AGENT'),
  baseBranch: z
    .string()
    .refine((value) => isValidBranchName(value), 'Invalid branch name')
    .nullish(),
})

export const sessionListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
})
