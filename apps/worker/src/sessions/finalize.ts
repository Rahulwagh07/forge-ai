import { prisma } from 'db'
import { installationOctokit, findOrCreatePr, type RepoRef } from 'github'
import type { SandboxHandle } from 'sandbox'
import { publishEvent } from '../runtime/events.ts'
import { runInRepo } from '../sandbox/git.ts'
import { shellQuote } from 'sandbox'
import { log } from '../runtime/log.ts'

export interface ChangeStats {
  files: number
  additions: number
  deletions: number
}

const FINALIZE_SQL = `UPDATE "Session" s
SET "status" = $2::"SessionStatus", "completedAt" = $3, "lastActiveAt" = now()
WHERE s."id" = $1
  AND s."status" = 'RUNNING'
  AND NOT EXISTS (
    SELECT 1 FROM "SessionStep" st
    WHERE st."sessionId" = s."id"
      AND st."type" = 'STEERING'
      AND st."consumedAt" IS NULL
  )
RETURNING s."id"`

export async function finalizeIfNoSteering(
  sessionId: string,
  status: 'DONE' | 'AWAITING_INPUT',
  completedAt: Date | null,
): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    FINALIZE_SQL,
    sessionId,
    status,
    completedAt,
  )
  return rows.length > 0
}

export async function requeueForSteering(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'QUEUED', completedAt: null, lastActiveAt: new Date() },
  })
  log.info('requeued session for steering', { sessionId })
}

async function pushBranch(
  sandbox: SandboxHandle,
  sessionId: string,
  branchName: string,
  authUrl: string,
): Promise<void> {
  const result = await runInRepo(
    sandbox,
    `git push ${shellQuote(authUrl)} ${shellQuote(branchName)}`,
  )
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to push branch ${branchName} (exit ${result.exitCode}):\n${result.stdout}\n${result.stderr}`,
    )
  }
  await prisma.session
    .update({
      where: { id: sessionId },
      data: { branchPushed: true },
    })
    .catch((error) =>
      log.warn('failed to mark branch pushed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
}

export async function pushAndNotify(
  sandbox: SandboxHandle,
  sessionId: string,
  branchName: string,
  authUrl: string,
): Promise<void> {
  await pushBranch(sandbox, sessionId, branchName, authUrl)
  await publishEvent(sessionId, { type: 'branch_pushed', branch: branchName })
}

export function isMissingBaseError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const record = err as Record<string, unknown>
  if (record.status !== 422) return false
  const pools: unknown[] = [record.errors, record.data]
  const response = record.response
  if (typeof response === 'object' && response !== null) {
    const responseRecord = response as Record<string, unknown>
    pools.push(responseRecord.errors)
    const data = responseRecord.data
    if (typeof data === 'object' && data !== null) {
      pools.push((data as Record<string, unknown>).errors)
    }
  }
  return pools.some(
    (pool) =>
      Array.isArray(pool) &&
      pool.some(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          (entry as Record<string, unknown>).resource === 'PullRequest' &&
          (entry as Record<string, unknown>).field === 'base' &&
          (entry as Record<string, unknown>).code === 'invalid',
      ),
  )
}
export function prTitle(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, ' ')
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized
}

export async function finishWithPr(opts: {
  sessionId: string
  branchName: string
  base: string
  prompt: string
  token: string
  repoRef: RepoRef
  changeStats: ChangeStats | null
}): Promise<void> {
  const { sessionId, branchName, base, prompt, token, repoRef, changeStats } = opts

  log.info('creating PR', { sessionId })
  let pr: { url: string; created: boolean }
  try {
    pr = await findOrCreatePr(installationOctokit(token), repoRef, {
      title: prTitle(prompt),
      body: `This PR was created by an AI agent session.\n\n**Prompt:** ${prompt}\n\n**Session ID:** ${sessionId}`,
      head: branchName,
      base,
    })
  } catch (err) {
    if (!isMissingBaseError(err)) throw err
    log.warn('base branch missing at PR time, branch pushed without PR', { sessionId, base })
    await publishEvent(sessionId, {
      type: 'status',
      status: 'AWAITING_INPUT',
      error: `Branch ${branchName} is pushed, but no pull request was opened: base branch "${base}" does not exist. Create it, then retry the session.`,
    })
    return
  }

  await prisma.session.updateMany({
    where: { id: sessionId, status: 'AWAITING_INPUT' },
    data: {
      prUrl: pr.url,
      completedAt: null,
      lastActiveAt: new Date(),
    },
  })
  await publishEvent(sessionId, {
    type: 'pr_created',
    prUrl: pr.url,
    branch: branchName,
    title: prTitle(prompt),
    ...changeStats,
  })
  await publishEvent(sessionId, { type: 'status', status: 'AWAITING_INPUT' })

  log.info('session paused with PR', { sessionId, prUrl: pr.url })
}
