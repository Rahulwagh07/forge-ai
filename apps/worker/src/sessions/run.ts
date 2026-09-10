import { prisma } from 'db'
import { loadAppConfigFromEnv, mintInstallationToken, tokenEmbedUrl, type RepoRef } from 'github'
import type { SandboxHandle } from 'sandbox'
import { acquireSandbox, destroySandbox, touchSandbox } from '../sandbox/manager.ts'
import type { ManagedSandbox } from '../sandbox/manager.ts'
import { runAgentLoopForSession } from './loop/run.ts'
import { setSessionToken, clearSessionToken } from '../runtime/redaction.ts'
import { publishEvent } from '../runtime/events.ts'
import { log } from '../runtime/log.ts'
import { getChangeStats, ensureBaseBranch } from '../sandbox/git/index.ts'
import {
  finalizeIfNoSteering,
  pushAndNotify,
  requeueForSteering,
  finishWithPr,
} from './finalize.ts'
import { finalizeStopped, startStopPolling } from './stop.ts'

const HEARTBEAT_INTERVAL_MS = 30_000

export async function runSession(sessionId: string, stopWatermark = 0): Promise<void> {
  let sandbox: SandboxHandle | undefined
  let managedSandbox: ManagedSandbox | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let stopPoll: (() => void) | undefined
  const controller = new AbortController()

  log.info('starting session', { sessionId })

  const session = await loadSession(sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)

  const isAsk = session.mode === 'ASK'
  const isResume = !isAsk && session.branchPushed

  await publishEvent(sessionId, { type: 'status', status: 'RUNNING' })

  try {
    heartbeat = setInterval(() => {
      prisma.session
        .update({ where: { id: sessionId }, data: { lastActiveAt: new Date() } })
        .catch((error) =>
          log.warn('session heartbeat failed', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
    }, HEARTBEAT_INTERVAL_MS)
    stopPoll = startStopPolling(sessionId, controller, stopWatermark)

    const repoRef = parseRepoRef(session.repo.fullName)
    const config = loadAppConfigFromEnv()
    const token = await mintInstallationToken(config, repoRef)
    setSessionToken(sessionId, token)
    const cloneUrl = tokenEmbedUrl(token, repoRef)
    const branchName = session.branchName ?? `agent/session-${sessionId}`
    const baseBranch = session.baseBranch ?? session.repo.defaultBranch

    const acquired = await acquireSandbox({
      sessionId,
      isAsk,
      isResume,
      repoCloneUrl: cloneUrl,
      branchName,
      baseBranch,
      gitToken: token,
    })
    sandbox = acquired.sandbox
    managedSandbox = acquired.managed
    if (!isAsk && !isResume) {
      const baseState = await ensureBaseBranch(sandbox, baseBranch, branchName, cloneUrl)
      if (baseState === 'missing') {
        if (!(await settleSession(sessionId, 'AWAITING_INPUT', null))) return
        await publishEvent(sessionId, {
          type: 'status',
          status: 'AWAITING_INPUT',
          error: `Base branch "${baseBranch}" does not exist in ${session.repo.fullName}. Select an existing branch, then retry the session.`,
        })
        touchSandbox(managedSandbox)
        log.info('session paused, base branch missing', { sessionId, baseBranch })
        return
      }
    }

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

    if (controller.signal.aborted) {
      await finalizeStopped({
        sessionId,
        isAsk,
        sandbox,
        managedSandbox,
        branchName,
        authUrl: cloneUrl,
      })
      return
    }

    log.info('running agent loop', { sessionId })
    const { result: loopResult, commitRequested } = await runAgentLoopForSession({
      sessionId,
      prompt: session.prompt,
      isAsk,
      defaultBranch: baseBranch,
      sandbox,
      managedSandbox,
      authUrl: cloneUrl,
      signal: controller.signal,
    })

    log.info('agent loop completed', { sessionId, stoppedBy: loopResult.stoppedBy })
    if (loopResult.stoppedBy === 'aborted') {
      await finalizeStopped({
        sessionId,
        isAsk,
        sandbox,
        managedSandbox,
        branchName,
        authUrl: cloneUrl,
      })
      return
    }
    if (isAsk) {
      if (!(await settleSession(sessionId, 'AWAITING_INPUT', null))) return
      await publishEvent(sessionId, { type: 'status', status: 'AWAITING_INPUT' })
      touchSandbox(managedSandbox)
      log.info('ask session answered, ready for follow-up', { sessionId })
      return
    }
    const keepSessionOpen =
      loopResult.stoppedBy === 'finish_session' || loopResult.stoppedBy === 'timeout'
    if (keepSessionOpen) {
      await pushAndNotify(sandbox, sessionId, branchName, cloneUrl)
      if (!(await settleSession(sessionId, 'AWAITING_INPUT', null))) return
      if (commitRequested) {
        const changeStats = await getChangeStats(sandbox, baseBranch, true, cloneUrl)
        await finishWithPr({
          sessionId,
          branchName,
          base: baseBranch,
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

    const changeStats = await getChangeStats(sandbox, baseBranch, true, cloneUrl)
    if (
      changeStats &&
      changeStats.files === 0 &&
      changeStats.additions === 0 &&
      changeStats.deletions === 0
    ) {
      if (!(await settleSession(sessionId, 'DONE', new Date()))) return
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
    if (!(await settleSession(sessionId, 'AWAITING_INPUT', null))) return
    await finishWithPr({
      sessionId,
      branchName,
      base: baseBranch,
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
    await destroySandbox(sessionId, sandbox).catch((error) =>
      log.warn('session cleanup destroy failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
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
    stopPoll?.()
    clearSessionToken(sessionId)
  }
}

async function loadSession(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: { repo: true },
  })
}

function parseRepoRef(fullName: string): RepoRef {
  const [owner, repo] = fullName.split('/')
  if (!owner || !repo) {
    throw new Error(`Invalid repo fullName: ${fullName}`)
  }
  return { owner, repo }
}

async function settleSession(
  sessionId: string,
  status: 'DONE' | 'AWAITING_INPUT',
  completedAt: Date | null,
): Promise<boolean> {
  if (await finalizeIfNoSteering(sessionId, status, completedAt)) return true
  await requeueForSteering(sessionId)
  return false
}
