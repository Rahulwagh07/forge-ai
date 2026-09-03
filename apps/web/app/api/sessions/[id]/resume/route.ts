import { NextResponse } from 'next/server'
import { requireOwnedSession, requireUser, requeueSession } from '@/lib/session-resume'
import type { SessionStatus } from 'db'

const FROM_STATUSES: Record<string, SessionStatus[]> = {
  wake: ['AWAITING_INPUT', 'PAUSED'],
  retry: ['FAILED'],
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if ('error' in user) return user.error

  const { id: sessionId } = await params
  const owned = await requireOwnedSession(sessionId, user.data.userId, {
    id: true,
  })
  if ('error' in owned) return owned.error

  const { action } = await request.json().catch(() => ({}))
  const fromStatuses = FROM_STATUSES[action as string]
  if (!fromStatuses) {
    return NextResponse.json({ error: 'Unknown resume action' }, { status: 400 })
  }

  // state transition is the idempotency guard: a double click or retry requeues at most once
  const { status, queued } = await requeueSession(
    sessionId,
    user.data.userId,
    fromStatuses,
    'QUEUED',
  )
  return NextResponse.json({ sessionId, status, queued })
}
