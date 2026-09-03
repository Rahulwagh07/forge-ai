import 'server-only'
import { NextResponse } from 'next/server'
import { prisma } from 'db'
import type { Prisma, SessionStatus } from 'db'
import { getSession } from '@/auth'

type GuardResult<T> = { data: T } | { error: NextResponse }

export async function requireUser(): Promise<GuardResult<{ userId: string }>> {
  const authSession = await getSession()
  if (!authSession?.user || !authSession.userId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  return { data: { userId: authSession.userId } }
}

export async function requireOwnedSession<T extends Prisma.SessionSelect>(
  sessionId: string,
  userId: string,
  select: T,
): Promise<GuardResult<Prisma.SessionGetPayload<{ select: T }>>> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    select,
  })
  if (session) return { data: session }
  const exists = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true },
  })
  return exists
    ? {
        error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }),
      }
    : {
        error: NextResponse.json({ error: 'Session not found' }, { status: 404 }),
      }
}

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
