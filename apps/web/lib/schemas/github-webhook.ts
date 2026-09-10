import { z } from 'zod'

const webhookRepositorySchema = z.object({
  id: z.number(),
  full_name: z.string(),
  default_branch: z.string(),
})

export const installationWebhookSchema = z.object({
  installation: z.object({
    id: z.number(),
    account: z
      .object({
        login: z.string().optional(),
        type: z.string().optional(),
      })
      .optional(),
  }),
  action: z.string(),
  repositories: z.array(webhookRepositorySchema).optional(),
})

export const installationRepositoriesWebhookSchema = z.object({
  installation: z.object({ id: z.number() }),
  repositories_added: z.array(webhookRepositorySchema).optional(),
  repositories_removed: z.array(webhookRepositorySchema).optional(),
})
