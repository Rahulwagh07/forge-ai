import { prisma } from '@repo/db'
import type { SessionStep } from '@repo/db'
import { publishEvent } from '../../runtime/events.ts'
import { log } from '../../runtime/log.ts'

export function isCompactSteering(content: unknown): boolean {
  const record = content as { message?: unknown } | null
  const message = typeof record?.message === 'string' ? record.message : JSON.stringify(content)
  return message.trim() === '/compact'
}

export async function claimCompactRequests(sessionId: string): Promise<number> {
  const claimedSteering = await claimPendingSteering(sessionId)
  return claimedSteering.filter((step) => isCompactSteering(step.content)).length
}

export async function drainSteeringMessages(
  sessionId: string,
  onCompact: () => void,
): Promise<string[]> {
  const deliveredMessages: string[] = []
  for (const step of await claimPendingSteering(sessionId)) {
    if (isCompactSteering(step.content)) {
      onCompact()
      continue
    }
    const content = step.content as { message?: unknown }
    const message =
      typeof content.message === 'string' ? content.message : JSON.stringify(step.content)
    deliveredMessages.push(message)
    publishEvent(sessionId, { type: 'steering', message }).catch((error) =>
      log.warn('failed to publish steering', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
  return deliveredMessages
}

async function claimPendingSteering(sessionId: string): Promise<SessionStep[]> {
  const pendingSteering = await prisma.sessionStep.findMany({
    where: { sessionId, type: 'STEERING', consumedAt: null },
    orderBy: [{ stepNumber: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  })
  const claimedSteering: SessionStep[] = []
  for (const step of pendingSteering) {
    const claim = await prisma.sessionStep.updateMany({
      where: { id: step.id, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    if (claim.count > 0) claimedSteering.push(step)
  }
  return claimedSteering
}
