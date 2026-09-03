import { prisma } from 'db'
import { loadAppConfigFromEnv, mintInstallationToken, tokenEmbedUrl, type RepoRef } from 'github'
import type { SandboxHandle } from 'sandbox'
import { acquireSandbox, destroySandbox, touchSandbox } from './sandbox-manager.ts'
import type { ManagedSandbox } from './sandbox-manager.ts'
import { runAgentLoopForSession } from './agent-loop.ts'
import { setSessionToken, clearSessionToken } from './token-redaction.ts'
import { publishEvent } from './events.ts'
import { log } from './log.ts'
import { getChangeStats } from './git.ts'
import {
  finalizeIfNoSteering,
  pushAndNotify,
  requeueForSteering,
  finishWithPr,
} from './session-finalize.ts'

const HEARTBEAT_INTERVAL_MS = 30_000

export async function runSession(sessionId: string): Promise<void> {
  let sandbox: SandboxHandle | undefined
  let managedSandbox: ManagedSandbox | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  log.info('starting session', { sessionId })

  const session = await loadSession(sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)

  const isAsk = session.mode === 'ASK'
  // A session only has a pushed branch if it ran at least once before, so the
  // branch tells us whether this run resumes from the agent's last state.
  const isResume = !isAsk && session.branchPushed

  await publishEvent(sessionId, { type: 'status', status: 'RUNNING' })

  try {
    heartbeat = setInterval(() => {
      prisma.session
        .update({ where: { id: sessionId }, data: { lastActiveAt: new Date() } })
        .catch(() => {})
    }, HEARTBEAT_INTERVAL_MS)

    const repoRef = parseRepoRef(session.repo.fullName)
    const config = loadAppConfigFromEnv()
    const token = await mintInstallationToken(config, repoRef)
    setSessionToken(sessionId, token)
    const cloneUrl = tokenEmbedUrl(token, repoRef)
    const branchName = session.branchName ?? `agent/session-${sessionId}`

    const acquired = await acquireSandbox({
      sessionId,
      isAsk,
      isResume,
      repoCloneUrl: cloneUrl,
      branchName,
      gitToken: token,
    })
    sandbox = acquired.sandbox
    managedSandbox = acquired.managed

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        sandboxId: sandbox.id,
        lastActiveAt: new Date(),
        ...(isAsk ? {} : { branchName }),
      },
    })
    await publishEvent(sessionId, {
      type: 'sandbox_created',
      sandboxId: sandbox.id,
      branch: branchName,
    })

    log.info('running agent loop', { sessionId })
    const { result: loopResult, commitRequested } = await runAgentLoopForSession({
      sessionId,
      prompt: session.prompt,
      isAsk,
      defaultBranch: session.repo.defaultBranch,
      sandbox,
      managedSandbox,
      authUrl: cloneUrl,
    })

    log.info('agent loop completed', { sessionId, stoppedBy: loopResult.stoppedBy })
    if (isAsk) {
      if (!(await finalizeIfNoSteering(sessionId, 'AWAITING_INPUT', null))) {
        await requeueForSteering(sessionId)
        return
      }
      await publishEvent(sessionId, { type: 'status', status: 'AWAITING_INPUT' })
      touchSandbox(managedSandbox)
      log.info('ask session answered, ready for follow-up', { sessionId })
      return
    }
    const keepSessionOpen =
      loopResult.stoppedBy === 'finish_session' || loopResult.stoppedBy === 'timeout'
    if (keepSessionOpen) {
      await pushAndNotify(sandbox, sessionId, branchName, cloneUrl)
      if (!(await finalizeIfNoSteering(sessionId, 'AWAITING_INPUT', null))) {
        await requeueForSteering(sessionId)
        return
      }
      if (commitRequested) {
        const changeStats = await getChangeStats(
          sandbox,
          session.repo.defaultBranch,
          true,
          cloneUrl,
        )
        await finishWithPr({
          sessionId,
          branchName,
          base: session.repo.defaultBranch,
          prompt: session.prompt,
          token,
          repoRef,
          changeStats,
        })
      } else {
        await publishEvent(sessionId, { type: 'status', status: 'AWAITING_INPUT' })
      }
      touchSandbox(managedSandbox)
      log.info('session paused, sandbox kept', { sessionId })
      return
    }

    const changeStats = await getChangeStats(sandbox, session.repo.defaultBranch, true, cloneUrl)
    if (changeStats.files === 0 && changeStats.additions === 0 && changeStats.deletions === 0) {
      if (!(await finalizeIfNoSteering(sessionId, 'DONE', new Date()))) {
        await requeueForSteering(sessionId)
        return
      }
      await publishEvent(sessionId, {
        type: 'status',
        status: 'DONE',
        error: 'No changes to commit. The agent completed without modifying the repository.',
      })
      await destroySandbox(sessionId, sandbox)
      log.info('session completed with no changes', { sessionId })
      return
    }

    await pushAndNotify(sandbox, sessionId, branchName, cloneUrl)
    if (!(await finalizeIfNoSteering(sessionId, 'AWAITING_INPUT', null))) {
      await requeueForSteering(sessionId)
      return
    }
    await finishWithPr({
      sessionId,
      branchName,
      base: session.repo.defaultBranch,
      prompt: session.prompt,
      token,
      repoRef,
      changeStats,
    })
    touchSandbox(managedSandbox)
  } catch (error) {
    log.error('session failed', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
    await destroySandbox(sessionId, sandbox).catch(() => {})
    await prisma.session.updateMany({
      where: { id: sessionId, status: { not: 'QUEUED' } },
      data: { status: 'FAILED', completedAt: new Date() },
    })
    await publishEvent(sessionId, {
      type: 'status',
      status: 'FAILED',
      error: 'The session failed. Please retry.',
    })

    throw error
  } finally {
    if (heartbeat) clearInterval(heartbeat)
    clearSessionToken(sessionId)
  }
}

async function loadSession(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      repo: {
        include: {
          installation: true,
        },
      },
    },
  })
}

function parseRepoRef(fullName: string): RepoRef {
  const [owner, repo] = fullName.split('/')
  if (!owner || !repo) {
    throw new Error(`Invalid repo fullName: ${fullName}`)
  }
  return { owner, repo }
}
