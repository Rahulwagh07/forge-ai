import { Prisma } from 'db'
import { PubSub } from 'redis'
import { redactFor } from './redaction.ts'

const pubsub = new PubSub()

export async function publishEvent(
  sessionId: string,
  event: Record<string, unknown>,
): Promise<void> {
  await pubsub.publish(`session:${sessionId}:events`, redactFor(sessionId, event))
}

export function toJsonValue(sessionId: string, value: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(redactFor(sessionId, value))) as Prisma.InputJsonValue
}
