import { prisma } from 'db'
import { getSandboxProvider } from 'sandbox'
import { env } from '../env.ts'
import type { SandboxHandle, SandboxProvider } from 'sandbox'
import { log } from '../runtime/log.ts'

const sandboxProvider: SandboxProvider = getSandboxProvider()

export type ManagedSandbox = {
  sandbox: SandboxHandle
  lastUsedAt: number
}

const managedSandboxes = new Map<string, ManagedSandbox>()

export function touchSandbox(managed: ManagedSandbox | undefined): void {
  if (managed) managed.lastUsedAt = Date.now()
}

export async function destroySandbox(
  sessionId: string,
  sandbox: SandboxHandle | undefined,
): Promise<void> {
  if (!sandbox) return
  const managed = managedSandboxes.get(sessionId)
  if (managed?.sandbox === sandbox) managedSandboxes.delete(sessionId)
  await sandbox.destroy()
}

export function startSandboxCleanup(): () => void {
  const intervalMs = env.SANDBOX_REAPER_INTERVAL_MS
  const timer = setInterval(() => {
    void destroyIdleSandboxes()
  }, intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}

async function destroyIdleSandboxes(): Promise<void> {
  const now = Date.now()
  const idleTimeoutMs = env.SANDBOX_IDLE_TIMEOUT_MS

  for (const [sessionId, managed] of managedSandboxes) {
    if (now - managed.lastUsedAt < idleTimeoutMs) continue

    const session = await prisma.session
      .findUnique({
        where: { id: sessionId },
        select: { status: true },
      })
      .catch(() => null)
    if (!session || session.status === 'RUNNING') continue

    managedSandboxes.delete(sessionId)
    await managed.sandbox.destroy().catch((error) => {
      log.error('failed to reap idle sandbox', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
    await markSessionPaused(sessionId).catch((error) =>
      log.warn('failed to mark session paused after reap', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    log.info('reaped idle sandbox', { sessionId })
  }

  await destroyOrphanedContainers(now, idleTimeoutMs)
}

async function destroyOrphanedContainers(now: number, idleTimeoutMs: number): Promise<void> {
  try {
    const orphans = await sandboxProvider.listSandboxes()
    for (const orphan of orphans) {
      const managed = managedSandboxes.get(orphan.sessionId)
      if (managed?.sandbox.id === orphan.id) continue // this process still owns it

      const session = await prisma.session
        .findUnique({
          where: { id: orphan.sessionId },
          select: { status: true, lastActiveAt: true },
        })
        .catch(() => null)
      if (!session) continue
      if (session.status === 'RUNNING') continue
      if (
        session.status === 'AWAITING_INPUT' &&
        now - session.lastActiveAt.getTime() < idleTimeoutMs
      )
        continue

      await sandboxProvider.destroySandbox(orphan.id)
      await markSessionPaused(orphan.sessionId).catch((error) =>
        log.warn('failed to mark orphan session paused', {
          sessionId: orphan.sessionId,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      log.info('swept orphan sandbox', { sessionId: orphan.sessionId, sandboxId: orphan.id })
    }
  } catch (error) {
    log.error('orphan sweep failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function markSessionPaused(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, status: 'AWAITING_INPUT' },
    data: { status: 'PAUSED', lastActiveAt: new Date() },
  })
}

interface AcquireSandboxOptions {
  sessionId: string
  isAsk: boolean
  isResume: boolean
  repoCloneUrl: string
  branchName: string
  baseBranch?: string | null
  gitToken: string
}

export async function acquireSandbox(
  opts: AcquireSandboxOptions,
): Promise<{ sandbox: SandboxHandle; managed: ManagedSandbox }> {
  const { sessionId, isAsk, isResume, repoCloneUrl, branchName, baseBranch } = opts

  const existing = managedSandboxes.get(sessionId)
  if (existing) {
    touchSandbox(existing)
    log.info('reusing sandbox', { sessionId, sandboxId: existing.sandbox.id })
    return { sandbox: existing.sandbox, managed: existing }
  }

  log.info('creating sandbox', { sessionId, isAsk, isResume, branchName, baseBranch })
  const sandbox = await sandboxProvider.create({
    repoCloneUrl,
    ...(isAsk
      ? baseBranch
        ? { branch: baseBranch }
        : {}
      : isResume
        ? { branch: branchName }
        : {
            ...(baseBranch ? { branch: baseBranch } : {}),
            createBranch: branchName,
          }),
    sessionId,
    env: sandboxGitEnv(opts.gitToken),
  })

  const managed: ManagedSandbox = {
    sandbox,
    lastUsedAt: Date.now(),
  }
  managedSandboxes.set(sessionId, managed)
  return { sandbox, managed }
}

function sandboxGitEnv(gitToken: string): Record<string, string> {
  return {
    FORGE_GIT_TOKEN: gitToken,
    GIT_AUTHOR_NAME: env.GIT_AUTHOR_NAME ?? env.SANDBOX_GIT_NAME ?? 'forge-agent',
    GIT_AUTHOR_EMAIL:
      env.GIT_AUTHOR_EMAIL ?? env.SANDBOX_GIT_EMAIL ?? 'forge-agent@users.noreply.github.com',
    GIT_COMMITTER_NAME: env.GIT_COMMITTER_NAME ?? env.SANDBOX_GIT_NAME ?? 'forge-agent',
    GIT_COMMITTER_EMAIL:
      env.GIT_COMMITTER_EMAIL ?? env.SANDBOX_GIT_EMAIL ?? 'forge-agent@users.noreply.github.com',
  }
}
