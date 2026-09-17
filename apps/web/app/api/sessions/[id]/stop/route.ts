import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@repo/db'
import { requireOwnedSession, requireUser } from '@/lib/auth-guards'
import { log } from '@/lib/log'
import { parseParams } from '@/lib/validation'
import { idParamSchema } from '@/lib/schemas/common'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params

  const parsedParams = parseParams({ id: sessionId }, idParamSchema)
  if ('error' in parsedParams) return parsedParams.error

  const user = await requireUser()
  if ('error' in user) return user.error

  try {
    const owned = await requireOwnedSession(sessionId, user.data.userId, { status: true })
    if ('error' in owned) return owned.error
    const session = owned.data

    if (session.status === 'RUNNING') {
      await requestStop(sessionId)
    } else if (session.status === 'QUEUED') {
      const cancelled = await prisma.session.updateMany({
        where: { id: sessionId, status: 'QUEUED' },
        data: { status: 'AWAITING_INPUT', completedAt: null, lastActiveAt: new Date() },
      })
      if (cancelled.count === 0) await requestStop(sessionId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('failed to stop session', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Failed to stop session' }, { status: 500 })
  }
}

async function requestStop(sessionId: string): Promise<void> {
  const lastStep = await prisma.sessionStep.findFirst({
    where: { sessionId },
    orderBy: [{ stepNumber: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: { stepNumber: true },
  })
  await prisma.sessionStep.create({
    data: {
      sessionId,
      stepNumber: (lastStep?.stepNumber ?? 0) + 1,
      type: 'STOP',
      content: {},
    },
  })
}
