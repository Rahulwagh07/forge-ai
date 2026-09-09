import { NextRequest, NextResponse } from 'next/server'
import { prisma } from 'db'
import { requireUser } from '@/lib/session-resume'
import { isValidBranchName } from '@/lib/utils'
import { log } from '@/lib/log'

export async function GET(request: NextRequest) {
  const user = await requireUser()
  if ('error' in user) return user.error
  const userId = user.data.userId

  const q = request.nextUrl.searchParams.get('q')?.trim()
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
    const body = await request.json()
    const { repoId, prompt, provider = 'OPENAI', mode = 'AGENT', baseBranch } = body
    const normalizedMode = mode === 'ASK' ? 'ASK' : 'AGENT'

    if (!repoId || !prompt) {
      return NextResponse.json(
        { error: 'Missing required fields: repoId, prompt' },
        { status: 400 },
      )
    }
    if (baseBranch !== undefined && baseBranch !== null && !isValidBranchName(baseBranch)) {
      return NextResponse.json({ error: 'Invalid branch name' }, { status: 400 })
    }
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
        mode: normalizedMode,
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
