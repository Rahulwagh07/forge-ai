import { z } from 'zod'

export const installationIdQuerySchema = z.object({
  installation_id: z.string().regex(/^\d+$/, 'installation_id must be a positive integer'),
})
