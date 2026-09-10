import type { SandboxHandle } from 'sandbox'
import { shellQuote } from 'sandbox'
import { runInRepo } from './exec.ts'

type BaseBranchState = 'exists' | 'seeded' | 'missing'

export async function ensureBaseBranch(
  sandbox: SandboxHandle,
  base: string,
  branchName: string,
  authUrl: string,
): Promise<BaseBranchState> {
  const baseRef = `refs/remotes/origin/${base}`
  const hasBase = await runInRepo(sandbox, `git show-ref --verify --quiet ${shellQuote(baseRef)}`, {
    timeoutMs: 30_000,
  })
  if (hasBase.exitCode === 0) return 'exists'

  const remotes = await runInRepo(sandbox, 'git branch -r', { timeoutMs: 30_000 })
  if (remotes.exitCode === 0 && remotes.stdout.trim()) return 'missing'

  await seedBaseBranch(sandbox, base, authUrl)
  const checkout = await runInRepo(
    sandbox,
    `git checkout -B ${shellQuote(branchName)} ${shellQuote(base)}`,
    { timeoutMs: 30_000 },
  )
  if (checkout.exitCode !== 0) {
    throw new Error(`[worker] failed to rebase session branch onto base:\n${checkout.stderr}`)
  }
  return 'seeded'
}

async function seedBaseBranch(
  sandbox: SandboxHandle,
  base: string,
  authUrl: string,
): Promise<void> {
  const tree = await runInRepo(sandbox, 'git hash-object -t tree /dev/null', {
    timeoutMs: 30_000,
  })
  if (tree.exitCode !== 0 || !tree.stdout.trim()) {
    throw new Error(`[worker] failed to create empty tree:\n${tree.stderr}`)
  }
  const commit = await runInRepo(
    sandbox,
    `git commit-tree ${shellQuote(tree.stdout.trim())} -m 'Initial commit'`,
    { timeoutMs: 30_000 },
  )
  if (commit.exitCode !== 0 || !commit.stdout.trim()) {
    throw new Error(`[worker] failed to create seed commit:\n${commit.stderr}`)
  }
  const ref = await runInRepo(
    sandbox,
    `git update-ref ${shellQuote(`refs/heads/${base}`)} ${shellQuote(commit.stdout.trim())}`,
    { timeoutMs: 30_000 },
  )
  if (ref.exitCode !== 0) {
    throw new Error(`[worker] failed to create base ref:\n${ref.stderr}`)
  }
  const push = await runInRepo(sandbox, `git push ${shellQuote(authUrl)} ${shellQuote(base)}`, {
    timeoutMs: 60_000,
  })
  if (push.exitCode !== 0) {
    throw new Error(`[worker] failed to push base branch:\n${push.stderr}`)
  }
}
