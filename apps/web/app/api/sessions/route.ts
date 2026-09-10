import { NextRequest, NextResponse } from 'next/server'
import { prisma } from 'db'
import { requireUser } from '@/lib/auth-guards'
import { log } from '@/lib/log'
import { parseBody, parseQuery } from '@/lib/validation'
import { createSessionSchema, sessionListQuerySchema } from '@/lib/schemas/sessions'

export async function GET(request: NextRequest) {
  const user = await requireUser()
  if ('error' in user) return user.error
  const userId = user.data.userId

  const parsed = parseQuery(request.nextUrl, sessionListQuerySchema)
  if ('error' in parsed) return parsed.error
  const q = parsed.data.q

  // list the user's sessions, matching query against prompt or repo name when set
  const sessions = await prisma.session.findMany({
    where: {
      userId,
      ...(q
        ? {
            OR: [
              { prompt: { contains: q, mode: 'insensitive' } },
              { repo: { fullName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: q ? 50 : 30,
    select: {
      id: true,
      prompt: true,
      createdAt: true,
      status: true,
      repo: { select: { fullName: true } },
    },
  })

  return NextResponse.json({
    sessions: sessions.map(({ repo, ...s }) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      repoFullName: repo.fullName,
    })),
  })
}

export async function POST(request: NextRequest) {
  const user = await requireUser()
  if ('error' in user) return user.error
  const userId = user.data.userId

  try {
    const parsed = await parseBody(request, createSessionSchema)
    if ('error' in parsed) return parsed.error
    const { repoId, prompt, provider, mode, baseBranch } = parsed.data

    const repo = await prisma.repo.findUnique({
      where: { id: repoId },
      include: { installation: true },
    })

    if (!repo) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
    }

    if (repo.installation.userId !== userId) {
      return NextResponse.json({ error: 'Not authorized for this repo' }, { status: 403 })
    }

    // create the session in QUEUED state..the worker picks it up for processing
    const dbSession = await prisma.session.create({
      data: {
        prompt,
        provider,
        mode,
        status: 'QUEUED',
        userId,
        repoId: repo.id,
        baseBranch: baseBranch ?? null,
      },
    })

    return NextResponse.json(
      {
        sessionId: dbSession.id,
        status: dbSession.status,
      },
      { status: 201 },
    )
  } catch (error) {
    log.error('failed to create session', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
