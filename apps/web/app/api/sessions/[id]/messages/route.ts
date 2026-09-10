import { NextRequest, NextResponse } from 'next/server'
import { prisma } from 'db'
import { requireOwnedSession, requireUser } from '@/lib/auth-guards'
import { log } from '@/lib/log'
import { parseBody } from '@/lib/validation'
import { steerMessageSchema } from '@/lib/schemas/session-messages'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params

  const user = await requireUser()
  if ('error' in user) return user.error

  try {
    const parsed = await parseBody(request, steerMessageSchema)
    if ('error' in parsed) return parsed.error
    const { message } = parsed.data

    const owned = await requireOwnedSession(sessionId, user.data.userId, {
      status: true,
    })
    if ('error' in owned) return owned.error
    const session = owned.data

    const canSteer =
      session.status === 'RUNNING' ||
      session.status === 'AWAITING_INPUT' ||
      session.status === 'PAUSED' ||
      session.status === 'FAILED' ||
      session.status === 'DONE'
    if (!canSteer) {
      return NextResponse.json({ error: 'Session is not running' }, { status: 400 })
    }

    // Persist steering once; the worker marks it consumed, so resume never re-delivers a live one
    const lastStep = await prisma.sessionStep.findFirst({
      where: { sessionId },
      orderBy: [{ stepNumber: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { stepNumber: true },
    })
    await prisma.sessionStep.create({
      data: {
        sessionId,
        stepNumber: (lastStep?.stepNumber ?? 0) + 1,
        type: 'STEERING',
        content: { message },
      },
    })

    // Requeue if not RUNNING (live worker drains steering from DB)
    await prisma.session.updateMany({
      where: { id: sessionId, status: { not: 'RUNNING' } },
      data: { status: 'QUEUED', completedAt: null, lastActiveAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('failed to send steering message', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Failed to send steering message' }, { status: 500 })
  }
}
