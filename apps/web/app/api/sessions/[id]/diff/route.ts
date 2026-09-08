import { NextRequest, NextResponse } from 'next/server'
import { prisma } from 'db'
import { requireOwnedSession, requireUser } from '@/lib/session-resume'
import { normalizeDiffFileStatus } from '@/lib/diff'
import type { DiffFileMeta } from '@/lib/types'

type DiffRow = {
  path: string
  status: string
  previousPath: string | null
  additions: number
  deletions: number
  binary: boolean
  contentTooLarge: boolean
}

function buildDiffFileMeta(row: DiffRow): DiffFileMeta {
  return {
    path: row.path,
    status: normalizeDiffFileStatus(row.status),
    previousPath: row.previousPath ?? undefined,
    additions: row.additions,
    deletions: row.deletions,
    binary: row.binary,
    contentTooLarge: row.contentTooLarge,
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params

  const user = await requireUser()
  if ('error' in user) return user.error
  const owned = await requireOwnedSession(sessionId, user.data.userId, { id: true })
  if ('error' in owned) return owned.error

  const url = new URL(request.url)
  const path = url.searchParams.get('path')
  const withContents = url.searchParams.get('contents') === '1'
  if (path) {
    const row = await prisma.sessionDiffFile.findUnique({
      where: { sessionId_path: { sessionId, path } },
    })
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (withContents) {
      return NextResponse.json({
        ...buildDiffFileMeta(row),
        oldContent: row.oldContent ?? '',
        newContent: row.newContent ?? '',
      })
    }
    return NextResponse.json({ ...buildDiffFileMeta(row), patch: row.patch })
  }

  const rows = await prisma.sessionDiffFile.findMany({
    where: { sessionId },
    orderBy: { path: 'asc' },
  })
  const files = rows.map(buildDiffFileMeta)
  const totals = files.reduce(
    (acc, file) => ({
      files: acc.files + 1,
      additions: acc.additions + file.additions,
      deletions: acc.deletions + file.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  )
  return NextResponse.json({ files, totals })
}
