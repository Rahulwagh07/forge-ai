import { prisma } from '@repo/db'
import type { Prisma } from '@repo/db'
import {
  loadAppConfigFromEnv,
  mintInstallationToken,
  tokenEmbedUrl,
  parseRepoRef,
  type RepoRef,
} from '@repo/github'
import type { SandboxHandle } from '@repo/sandbox'
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

type SessionWithRepo = Prisma.SessionGetPayload<{ include: { repo: true } }>

interface SessionResources {
  repoRef: RepoRef
  token: string
  cloneUrl: string
  sandbox: SandboxHandle
  managedSandbox: ManagedSandbox
  branchName: string
  baseBranch: string
  askMode: boolean
}

export async function runSession(sessionId: string, stopWatermark = 0): Promise<void> {
  let sandbox: SandboxHandle | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let stopPoll: (() => void) | undefined
  const controller = new AbortController()

  log.info('starting session', { sessionId })

  const session = await loadSession(sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)

  const askMode = session.mode === 'ASK'
  const resumeMode = !askMode && session.branchPushed

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

    const resources = await prepareSession(session, sessionId, askMode, resumeMode)
    if (!resources) return
    sandbox = resources.sandbox

    if (controller.signal.aborted) {
      await finalizeStopped({
        sessionId,
        askMode: resources.askMode,
        sandbox: resources.sandbox,
        managedSandbox: resources.managedSandbox,
        branchName: resources.branchName,
        authUrl: resources.cloneUrl,
      })
      return
    }

    log.info('running agent loop', { sessionId })
    const { result: loopResult, commitRequested } = await runAgentLoopForSession({
      sessionId,
      prompt: session.prompt,
      askMode,
      baseBranch: resources.baseBranch,
      sandbox: resources.sandbox,
      authUrl: resources.cloneUrl,
      signal: controller.signal,
    })

    log.info('agent loop completed', { sessionId, stoppedBy: loopResult.stoppedBy })
    await completeSessionRun(sessionId, session, resources, loopResult, commitRequested)
  } catch (error) {
    await failSession(sessionId, sandbox, error)
  } finally {
    if (heartbeat) clearInterval(heartbeat)
    stopPoll?.()
    clearSessionToken(sessionId)
  }
}

async function prepareSession(
  session: SessionWithRepo,
  sessionId: string,
  askMode: boolean,
  resumeMode: boolean,
): Promise<SessionResources | null> {
  const repoRef = parseRepoRef(session.repo.fullName)
  const token = await mintInstallationToken(loadAppConfigFromEnv(), repoRef)
  setSessionToken(sessionId, token)
  const cloneUrl = tokenEmbedUrl(token, repoRef)
  const branchName = session.branchName ?? `agent/session-${sessionId}`
  const baseBranch = session.baseBranch ?? session.repo.defaultBranch
  const acquired = await acquireSandbox({
    sessionId,
    askMode,
    resumeMode,
    repoCloneUrl: cloneUrl,
    branchName,
    baseBranch,
    gitToken: token,
  })

  try {
    if (!askMode && !resumeMode) {
      const baseState = await ensureBaseBranch(acquired.sandbox, baseBranch, branchName, cloneUrl)
      if (baseState === 'missing') {
        if (!(await settleSession(sessionId, 'AWAITING_INPUT', null))) return null
        await publishEvent(sessionId, {
          type: 'status',
          status: 'AWAITING_INPUT',
          error: `Base branch "${baseBranch}" does not exist in ${session.repo.fullName}. Select an existing branch, then retry the session.`,
        })
        touchSandbox(acquired.managed)
        log.info('session paused, base branch missing', { sessionId, baseBranch })
        return null
      }
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        sandboxId: acquired.sandbox.id,
        lastActiveAt: new Date(),
        ...(askMode ? {} : { branchName }),
      },
    })
    await publishEvent(sessionId, {
      type: 'sandbox_created',
      sandboxId: acquired.sandbox.id,
      branch: branchName,
    })
  } catch (error) {
    await destroySandbox(sessionId, acquired.sandbox).catch(() => {})
    throw error
  }

  return {
    repoRef,
    token,
    cloneUrl,
    sandbox: acquired.sandbox,
    managedSandbox: acquired.managed,
    branchName,
    baseBranch,
    askMode,
  }
}

async function completeSessionRun(
  sessionId: string,
  session: SessionWithRepo,
  resources: SessionResources,
  loopResult: Awaited<ReturnType<typeof runAgentLoopForSession>>['result'],
  commitRequested: boolean,
): Promise<void> {
  const { repoRef, token, cloneUrl, sandbox, managedSandbox, branchName, baseBranch, askMode } =
    resources

  if (loopResult.stoppedBy === 'aborted') {
    await finalizeStopped({
      sessionId,
      askMode,
      sandbox,
      managedSandbox,
      branchName,
      authUrl: cloneUrl,
    })
    return
  }
  if (askMode) return handleAskSession(sessionId, managedSandbox)

  const keepSessionOpen = [
    'finish_session',
    'max_tokens',
    'timeout',
    'token_budget',
    'consecutive_errors',
  ].includes(loopResult.stoppedBy)
  if (keepSessionOpen)
    return keepSessionOpenForInput(session, sessionId, resources, commitRequested)

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
}

async function handleAskSession(sessionId: string, managedSandbox: ManagedSandbox): Promise<void> {
  if (!(await settleSession(sessionId, 'AWAITING_INPUT', null))) return
  await publishEvent(sessionId, { type: 'status', status: 'AWAITING_INPUT' })
  touchSandbox(managedSandbox)
  log.info('ask session answered, ready for follow-up', { sessionId })
}

async function keepSessionOpenForInput(
  session: SessionWithRepo,
  sessionId: string,
  resources: SessionResources,
  commitRequested: boolean,
): Promise<void> {
  const { sandbox, managedSandbox, branchName, baseBranch, cloneUrl, token, repoRef } = resources
  await pushAndNotify(sandbox, sessionId, branchName, cloneUrl)
  if (!(await settleSession(sessionId, 'AWAITING_INPUT', null))) return
  if (commitRequested) {
    await finishWithPr({
      sessionId,
      branchName,
      base: baseBranch,
      prompt: session.prompt,
      token,
      repoRef,
      changeStats: await getChangeStats(sandbox, baseBranch, true, cloneUrl),
    })
  } else {
    await publishEvent(sessionId, { type: 'status', status: 'AWAITING_INPUT' })
  }
  touchSandbox(managedSandbox)
  log.info('session paused, sandbox kept', { sessionId })
}

async function failSession(
  sessionId: string,
  sandbox: SandboxHandle | undefined,
  error: unknown,
): Promise<never> {
  log.error('session failed', {
    sessionId,
    error: error instanceof Error ? error.message : String(error),
  })
  await destroySandbox(sessionId, sandbox).catch((cleanupError) =>
    log.warn('session cleanup destroy failed', {
      sessionId,
      error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
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
}

async function loadSession(sessionId: string): Promise<SessionWithRepo | null> {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: { repo: true },
  })
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
