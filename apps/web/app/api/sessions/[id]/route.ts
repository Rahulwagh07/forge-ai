import { NextRequest, NextResponse } from 'next/server'
import { prisma } from 'db'
import { requireOwnedSession, requireUser } from '@/lib/auth-guards'
import { log } from '@/lib/log'
import { parseParams } from '@/lib/validation'
import { idParamSchema } from '@/lib/schemas/common'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params

  const parsedParams = parseParams({ id: sessionId }, idParamSchema)
  if ('error' in parsedParams) return parsedParams.error

  const user = await requireUser()
  if ('error' in user) return user.error

  try {
    const owned = await requireOwnedSession(sessionId, user.data.userId, { status: true })
    if ('error' in owned) return owned.error
    if (owned.data.status === 'RUNNING') {
      return NextResponse.json({ error: 'Stop the session before deleting it' }, { status: 409 })
    }

    // steps have no FK cascade, so remove them first
    await prisma.sessionStep.deleteMany({ where: { sessionId } })
    await prisma.session.deleteMany({ where: { id: sessionId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('failed to delete session', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
