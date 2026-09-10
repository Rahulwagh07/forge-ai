import { prisma } from 'db'
import type { SandboxHandle } from 'sandbox'
import { touchSandbox, type ManagedSandbox } from '../sandbox/manager.ts'
import { publishEvent } from '../runtime/events.ts'
import { log } from '../runtime/log.ts'
import { finalizeStoppedSession, pushAndNotify } from './finalize.ts'

const STOP_POLL_INTERVAL_MS = 1_000

// only stop newer than the claim watermark are honored, so a stop that raced the end of a
// previous run can not kill the next one
export function startStopPolling(
  sessionId: string,
  controller: AbortController,
  minStepNumber: number,
): () => void {
  const timer = setInterval(() => {
    void (async () => {
      try {
        const stop = await prisma.sessionStep.findFirst({
          where: { sessionId, type: 'STOP', consumedAt: null, stepNumber: { gt: minStepNumber } },
          orderBy: [{ stepNumber: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        })
        if (!stop) return
        const claim = await prisma.sessionStep.updateMany({
          where: { id: stop.id, consumedAt: null },
          data: { consumedAt: new Date() },
        })
        if (claim.count > 0) controller.abort()
      } catch (error) {
        log.warn('stop poll failed', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })()
  }, STOP_POLL_INTERVAL_MS)
  timer.unref?.()
  return () => clearInterval(timer)
}

// save whatever the agent already did, keep the sandbox, and pause.
export async function finalizeStopped(opts: {
  sessionId: string
  isAsk: boolean
  sandbox?: SandboxHandle
  managedSandbox?: ManagedSandbox
  branchName: string
  authUrl: string
}): Promise<void> {
  const { sessionId, isAsk, sandbox, managedSandbox, branchName, authUrl } = opts
  if (!isAsk && sandbox) {
    await pushAndNotify(sandbox, sessionId, branchName, authUrl).catch((error) =>
      log.warn('failed to push branch on stop', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
  await finalizeStoppedSession(sessionId)
  await publishEvent(sessionId, {
    type: 'status',
    status: 'AWAITING_INPUT',
    error: 'Stopped by user',
  })
  touchSandbox(managedSandbox)
  log.info('session stopped by user', { sessionId })
}
