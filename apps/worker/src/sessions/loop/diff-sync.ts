import { prisma } from '@repo/db'
import type { SandboxHandle } from '@repo/sandbox'
import { getFileContents, getSessionDiffSnapshot } from '../../sandbox/git/index.ts'
import { publishEvent } from '../../runtime/events.ts'

export async function syncDiffAfterTool(
  sandbox: SandboxHandle,
  sessionId: string,
  baseBranch: string,
  fetchBase: boolean,
  authUrl: string,
): Promise<void> {
  const snapshot = await getSessionDiffSnapshot(sandbox, baseBranch, fetchBase, authUrl)
  const currentPaths = new Set(snapshot.files.map((file) => file.path))
  const existing = await prisma.sessionDiffFile.findMany({
    where: { sessionId },
    select: { path: true, patch: true, contentTooLarge: true },
  })
  const existingByPath = new Map(existing.map((row) => [row.path, row]))
  const changed = snapshot.files.filter(
    (file) => existingByPath.get(file.path)?.patch !== file.patch,
  )
  const contents = await getFileContents(sandbox, baseBranch, changed)
  const tooLargeByPath = new Map<string, boolean>()
  for (const file of snapshot.files) {
    tooLargeByPath.set(
      file.path,
      existingByPath.get(file.path)?.patch === file.patch
        ? (existingByPath.get(file.path)?.contentTooLarge ?? false)
        : (contents.get(file.path)?.contentTooLarge ?? false),
    )
  }
  await prisma.$transaction([
    prisma.sessionDiffFile.deleteMany({
      where: { sessionId, path: { notIn: [...currentPaths] } },
    }),
    ...changed.map((file) => {
      const content = contents.get(file.path)
      const diffFileFields = {
        status: file.status,
        previousPath: file.previousPath,
        additions: file.additions,
        deletions: file.deletions,
        binary: file.binary,
        patch: file.patch,
        oldContent: content?.oldContent ?? '',
        newContent: content?.newContent ?? '',
        contentTooLarge: content?.contentTooLarge ?? false,
      }
      return prisma.sessionDiffFile.upsert({
        where: { sessionId_path: { sessionId, path: file.path } },
        create: { sessionId, path: file.path, ...diffFileFields },
        update: diffFileFields,
      })
    }),
  ])
  await publishEvent(sessionId, {
    type: 'diff',
    files: snapshot.files.map((file) => ({
      path: file.path,
      status: file.status,
      previousPath: file.previousPath,
      additions: file.additions,
      deletions: file.deletions,
      binary: file.binary,
      contentTooLarge: tooLargeByPath.get(file.path) ?? false,
    })),
    totals: snapshot.totals,
  })
}
