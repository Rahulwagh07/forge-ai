import 'server-only'
import { prisma } from 'db'
import type { SessionStatus } from 'db'

export async function requeueSession(
  sessionId: string,
  userId: string,
  fromStatuses: SessionStatus[],
  nextStatus: SessionStatus,
): Promise<{ status: string; queued: boolean }> {
  const updated = await prisma.session.updateMany({
    where: { id: sessionId, userId, status: { in: fromStatuses } },
    data: { status: nextStatus, completedAt: null, lastActiveAt: new Date() },
  })
  if (updated.count === 0) {
    const current = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { status: true },
    })
    return { status: current?.status ?? '', queued: false }
  }
  return { status: nextStatus, queued: true }
}
