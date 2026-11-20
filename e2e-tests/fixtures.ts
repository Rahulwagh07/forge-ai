import { test as base, expect } from '@playwright/test'
import { cleanupRunSessions, settleRunSessions } from './helpers/cleanup.ts'
import { createWorkerController, type WorkerController } from './helpers/worker.ts'

interface E2EFixtures {
  runId: string
  worker: WorkerController
  cleanupSessions: void
}

export const test = base.extend<E2EFixtures>({
  runId: async ({}, use) => {
    await use(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  },
  worker: async ({ runId }, use) => {
    const worker = createWorkerController()
    await use(worker)
    try {
      await settleRunSessions(runId)
    } finally {
      await worker.stop()
    }
  },
  cleanupSessions: [
    async ({ runId }, use) => {
      await use()
      await cleanupRunSessions(runId)
    },
    { auto: true },
  ],
})

export { expect }
