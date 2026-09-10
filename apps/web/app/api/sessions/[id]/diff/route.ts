import { NextRequest, NextResponse } from 'next/server'
import { prisma } from 'db'
import { requireOwnedSession, requireUser } from '@/lib/auth-guards'
import { diffFileMetaFromRow, sumDiffTotals } from '@/lib/diff'
import { parseQuery } from '@/lib/validation'
import { diffQuerySchema } from '@/lib/schemas/session-diff'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params

  const user = await requireUser()
  if ('error' in user) return user.error
  const owned = await requireOwnedSession(sessionId, user.data.userId, { id: true })
  if ('error' in owned) return owned.error

  const parsed = parseQuery(request.url, diffQuerySchema)
  if ('error' in parsed) return parsed.error
  const { path, contents } = parsed.data
  const withContents = contents === '1'
  if (path) {
    const row = await prisma.sessionDiffFile.findUnique({
      where: { sessionId_path: { sessionId, path } },
    })
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (withContents) {
      return NextResponse.json({
        ...diffFileMetaFromRow(row),
        oldContent: row.oldContent ?? '',
        newContent: row.newContent ?? '',
      })
    }
    return NextResponse.json({ ...diffFileMetaFromRow(row), patch: row.patch })
  }

  const rows = await prisma.sessionDiffFile.findMany({
    where: { sessionId },
    orderBy: { path: 'asc' },
  })
  const files = rows.map(diffFileMetaFromRow)
  return NextResponse.json({ files, totals: sumDiffTotals(files) })
}
