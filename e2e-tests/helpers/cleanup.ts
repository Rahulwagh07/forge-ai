import { setTimeout as delay } from 'node:timers/promises'
import type { APIRequestContext } from '@playwright/test'
import {
  installationOctokit,
  loadAppConfigFromEnv,
  mintInstallationToken,
  parseRepoRef,
} from '@repo/github'
import { getSandboxProvider } from '@repo/sandbox'
import {
  createAppApi,
  deleteAppSession,
  listAppSessions,
  stopAppSession,
  type AppSession,
} from './app-api.ts'
import { PROMPT_PREFIX, SESSION_SETTLE_TIMEOUT_MS, TEST_REPO_FULL_NAME } from './env.ts'
import { createWorkerController } from './worker.ts'

const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING'])
const SETTLE_POLL_INTERVAL_MS = 500
const DELETE_ATTEMPTS = 3
const DELETE_RETRY_DELAY_MS = 1_000
const GITHUB_BRANCH_PREFIX = 'agent/session-'

async function sessionsMatching(api: APIRequestContext, scope: string): Promise<AppSession[]> {
  const sessions = await listAppSessions(api, scope)
  return sessions.filter((session) => session.prompt.includes(scope))
}

async function settleScope(scope: string): Promise<void> {
  const api = await createAppApi()
  try {
    const deadline = Date.now() + SESSION_SETTLE_TIMEOUT_MS
    let stopRequested = false
    while (true) {
      const active = (await sessionsMatching(api, scope)).filter((session) =>
        ACTIVE_STATUSES.has(session.status),
      )
      if (active.length === 0) return
      if (!stopRequested) {
        for (const session of active) await stopAppSession(api, session.id)
        stopRequested = true
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `sessions did not settle within ${SESSION_SETTLE_TIMEOUT_MS}ms: ${active
            .map((session) => `${session.id}:${session.status}`)
            .join(', ')}`,
        )
      }
      await delay(SETTLE_POLL_INTERVAL_MS)
    }
  } finally {
    await api.dispose()
  }
}

async function deleteSession(api: APIRequestContext, sessionId: string): Promise<void> {
  for (let attempt = 0; attempt < DELETE_ATTEMPTS; attempt += 1) {
    const status = await deleteAppSession(api, sessionId)
    if (status === 404 || status < 400) return
    if (status !== 409) throw new Error(`failed to delete session ${sessionId}: ${status}`)
    await stopAppSession(api, sessionId)
    await delay(DELETE_RETRY_DELAY_MS)
  }
  throw new Error(`session ${sessionId} is still running and cannot be deleted`)
}

async function cleanupScope(scope: string): Promise<void> {
  await settleScope(scope)
  const api = await createAppApi()
  let sessions: AppSession[] = []
  try {
    sessions = await sessionsMatching(api, scope)
    for (const session of sessions) await deleteSession(api, session.id)
  } finally {
    await api.dispose()
    await destroySessionContainers(sessions.map((session) => session.id))
    await deleteGithubBranches(sessions.map((session) => `${GITHUB_BRANCH_PREFIX}${session.id}`))
  }
}

export async function settleRunSessions(runId: string): Promise<void> {
  await settleScope(runId)
}

export async function cleanupRunSessions(runId: string): Promise<void> {
  await cleanupScope(runId)
}

export async function cleanupStaleE2ESessions(): Promise<void> {
  const api = await createAppApi()
  let hasRunning = false
  try {
    const sessions = await sessionsMatching(api, PROMPT_PREFIX)
    hasRunning = sessions.some((session) => session.status === 'RUNNING')
  } finally {
    await api.dispose()
  }

  const worker = createWorkerController()
  if (hasRunning) await worker.start()
  try {
    await cleanupScope(PROMPT_PREFIX)
  } finally {
    await worker.stop()
  }
}

async function destroySessionContainers(sessionIds: string[]): Promise<void> {
  const tracked = new Set(sessionIds)
  try {
    const provider = getSandboxProvider()
    const containers = await provider.listSandboxes()
    for (const container of containers) {
      if (!tracked.has(container.sessionId)) continue
      await provider.destroySandbox(container.id).catch(() => {})
    }
  } catch (error) {
    console.warn(
      `[e2e] sandbox cleanup skipped: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function deleteGithubBranches(branches: string[]): Promise<void> {
  const uniqueBranches = Array.from(new Set(branches))
  if (uniqueBranches.length === 0) return

  try {
    const repoRef = parseRepoRef(TEST_REPO_FULL_NAME)
    const token = await mintInstallationToken(loadAppConfigFromEnv(), repoRef)
    const octokit = installationOctokit(token)

    for (const branch of uniqueBranches) {
      const pulls = await octokit.rest.pulls
        .list({
          owner: repoRef.owner,
          repo: repoRef.repo,
          head: `${repoRef.owner}:${branch}`,
          state: 'open',
        })
        .catch(() => null)
      for (const pull of pulls?.data ?? []) {
        await octokit.rest.pulls
          .update({
            owner: repoRef.owner,
            repo: repoRef.repo,
            pull_number: pull.number,
            state: 'closed',
          })
          .catch(() => {})
      }
      await octokit.rest.git
        .deleteRef({
          owner: repoRef.owner,
          repo: repoRef.repo,
          ref: `heads/${branch}`,
        })
        .catch(() => {})
    }
  } catch (error) {
    console.warn(
      `[e2e] GitHub branch cleanup skipped: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
