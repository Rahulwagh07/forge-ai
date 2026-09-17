import { configDotenv } from 'dotenv'
configDotenv()

import { getSandboxProvider } from '@repo/sandbox'
import type { SandboxHandle } from '@repo/sandbox'
import {
  findOrCreatePr,
  installationOctokit,
  loadAppConfigFromEnv,
  mintInstallationToken,
  tokenEmbedUrl,
} from '@repo/github'
import { OpenAIProvider, runAgentLoop } from '../src/index.ts'

const REPO_URL = process.env.TEST_REPO_URL
if (!REPO_URL) {
  console.error('TEST_REPO_URL is not defined')
  process.exit(1)
}
if (!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY) {
  console.error('OPENAI_API_KEY or OPENROUTER_API_KEY is required')
  process.exit(1)
}

const SANDBOX_GIT_NAME = process.env.SANDBOX_GIT_NAME
if (!SANDBOX_GIT_NAME) {
  console.error('SANDBOX_GIT_NAME is not defined')
  process.exit(1)
}
const SANDBOX_GIT_EMAIL = process.env.SANDBOX_GIT_EMAIL
if (!SANDBOX_GIT_EMAIL) {
  console.error('SANDBOX_GIT_EMAIL is not defined')
  process.exit(1)
}

const gitIdentityEnv = {
  GIT_AUTHOR_NAME: SANDBOX_GIT_NAME,
  GIT_AUTHOR_EMAIL: SANDBOX_GIT_EMAIL,
  GIT_COMMITTER_NAME: SANDBOX_GIT_NAME,
  GIT_COMMITTER_EMAIL: SANDBOX_GIT_EMAIL,
}

const hasGitHubApp = !!process.env.GITHUB_APP_ID && !!process.env.GITHUB_APP_PRIVATE_KEY
const SESSION_BRANCH = `agent/session-agent-smoke-${Date.now().toString(36)}`

async function main(): Promise<void> {
  const repo = parseRepoRef(REPO_URL!)

  let cloneUrl = REPO_URL!
  let installToken: string | undefined
  if (hasGitHubApp) {
    console.log('minting installation token...')
    installToken = await mintInstallationToken(loadAppConfigFromEnv(), repo)
    cloneUrl = tokenEmbedUrl(installToken, repo)
    console.log('token embedded into clone URL (never logged)')
  } else {
    console.log('no GITHUB_APP_* env: running local-only (no push/PR)')
  }

  const provider = getSandboxProvider()
  console.log('creating sandbox...')
  const sandbox = await provider.create({
    repoCloneUrl: cloneUrl,
    sessionId: 'agent-smoke',
    createBranch: SESSION_BRANCH,
    env: gitIdentityEnv,
  })
  console.log(`sandbox ready: ${sandbox.id} on branch ${SESSION_BRANCH}`)

  try {
    const result = await runAgentLoop({
      provider: new OpenAIProvider({
        credentials: {
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
          OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
          OPENAI_MODEL: process.env.OPENAI_MODEL,
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        },
      }),
      sandbox,
      userPrompt:
        'Explore this repository, then write a file AGENT_NOTES.md at the repo root summarizing what the project does in 3 bullet points. Commit with a sensible message, then finish.',
      maxSteps: 15,
      onStep: (event) => {
        console.log(`\n=== step ${event.stepNumber} ===`)
        if (event.text) console.log(`[thought] ${event.text.slice(0, 300)}`)
        for (const call of event.toolCalls ?? []) {
          const argPreview = JSON.stringify(call.input).slice(0, 160)
          console.log(`[tool] ${call.name} ${argPreview}`)
        }
      },
    })

    console.log(`\nloop finished: steps=${result.steps} stoppedBy=${result.stoppedBy}`)
    if (result.finalText) console.log(`final: ${result.finalText.slice(0, 500)}`)

    const gitLog = await sandbox.runCommand('git log --oneline -3')
    console.log('\n--- git log ---\n' + gitLog.stdout)

    if (!installToken) {
      const notes = await sandbox.runCommand('ls -1 AGENT_NOTES.md')
      process.exitCode = notes.exitCode === 0 ? 0 : 1
      console.log(
        notes.exitCode === 0
          ? 'PASS: AGENT_NOTES.md exists and is committed'
          : 'FAIL: AGENT_NOTES.md was not created',
      )
      return
    }

    console.log('\npushing branch...')
    const pushed = await sandbox.runCommand('git push -u origin HEAD', {
      timeoutMs: 60_000,
    })
    if (pushed.exitCode !== 0) {
      throw new Error(`git push failed:\n${pushed.stderr}`)
    }
    console.log(`pushed ${SESSION_BRANCH}`)

    console.log('ensuring PR...')
    const pr = await findOrCreatePr(installationOctokit(installToken), repo, {
      head: SESSION_BRANCH,
      base: await defaultBranch(sandbox),
      title: '[agent] Add AGENT_NOTES.md project summary',
      body: 'Automated smoke-test session.',
    })
    console.log(`${pr.created ? 'opened' : 'existing'} PR: ${pr.url}`)
    process.exitCode = 0
  } finally {
    // Token lives only for this session; container dies with it.
    await sandbox.destroy().catch(() => {})
  }
}

async function defaultBranch(sandbox: SandboxHandle): Promise<string> {
  const res = await sandbox.runCommand(`git rev-parse --abbrev-ref origin/HEAD | sed 's|origin/||'`)
  return res.stdout.trim() || 'main'
}

function parseRepoRef(cloneUrl: string): { owner: string; repo: string } {
  const match = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(cloneUrl)
  if (!match) {
    throw new Error(`cannot parse owner/repo from: ${cloneUrl}`)
  }
  return { owner: match[1]!, repo: match[2]! }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
