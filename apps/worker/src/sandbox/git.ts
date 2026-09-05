import type { CommandResult, SandboxHandle } from 'sandbox'
import { shellQuote } from 'sandbox'

const REPO_DIR = '/workspace/repo'

export async function runInRepo(
  sandbox: SandboxHandle,
  cmd: string,
  opts: { timeoutMs?: number } = {},
): Promise<CommandResult> {
  return sandbox.runCommand(
    `chmod 755 ${shellQuote(REPO_DIR)} 2>/dev/null; cd ${shellQuote(REPO_DIR)} && ${cmd}`,
    { cwd: '/workspace', timeoutMs: opts.timeoutMs },
  )
}

function fetchBaseAndStageUntracked(
  defaultBranch: string,
  fetchBase: boolean,
  authUrl: string,
): string {
  const fetch = fetchBase
    ? `git fetch ${shellQuote(authUrl)} ${shellQuote(`${defaultBranch}:refs/remotes/origin/${defaultBranch}`)} --quiet >/dev/null 2>&1 || true; `
    : ''
  return `${fetch}git ls-files --others --exclude-standard -z | xargs -0 -r git add -N --; `
}

export type BaseBranchState = 'exists' | 'seeded' | 'missing'

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
export interface DiffWithStats {
  diff: string
  truncated: boolean
  stats: { files: number; additions: number; deletions: number } | null
}

export async function getDiffWithStats(
  sandbox: SandboxHandle,
  defaultBranch: string,
  fetchBase: boolean,
  authUrl: string,
  maxChars = 20000,
): Promise<DiffWithStats> {
  const base = shellQuote(`origin/${defaultBranch}`)
  const result = await runInRepo(
    sandbox,
    `${fetchBaseAndStageUntracked(defaultBranch, fetchBase, authUrl)}echo '===FORGE-NUMSTAT==='; git diff --numstat ${base} --; echo '===FORGE-UNIFIED==='; git diff --no-ext-diff --unified=1 ${base} --`,
    { timeoutMs: 30_000 },
  )
  if (result.exitCode !== 0) return { diff: '', truncated: false, stats: null }
  const marker = '\n===FORGE-UNIFIED===\n'
  const markerAt = result.stdout.indexOf(marker)
  const stats = parseNumstat(
    sectionAfter(
      markerAt < 0 ? result.stdout : result.stdout.slice(0, markerAt),
      '===FORGE-NUMSTAT===',
    ),
  )
  const raw = markerAt < 0 ? '' : result.stdout.slice(markerAt + marker.length)
  if (!raw.trim()) return { diff: '', truncated: false, stats }
  if (raw.length <= maxChars) return { diff: raw, truncated: false, stats }
  return { diff: `${raw.slice(0, maxChars)}\n... [truncated]`, truncated: true, stats }
}

function sectionAfter(output: string, marker: string): string {
  const at = output.indexOf(marker)
  return at < 0 ? '' : output.slice(at + marker.length)
}

function parseNumstat(output: string): { files: number; additions: number; deletions: number } {
  return output.split('\n').reduce(
    (stats, line) => {
      const [additions, deletions] = line.split('\t')
      const added = Number(additions)
      const removed = Number(deletions)
      if (Number.isFinite(added) && Number.isFinite(removed)) {
        stats.files += 1
        stats.additions += added
        stats.deletions += removed
      }
      return stats
    },
    { files: 0, additions: 0, deletions: 0 },
  )
}

export async function getChangeStats(
  sandbox: SandboxHandle,
  defaultBranch: string,
  fetchBase: boolean,
  authUrl: string,
): Promise<{ files: number; additions: number; deletions: number } | null> {
  const result = await runInRepo(
    sandbox,
    `${fetchBaseAndStageUntracked(defaultBranch, fetchBase, authUrl)}git diff --numstat ${shellQuote(`origin/${defaultBranch}`)} --`,
    { timeoutMs: 30_000 },
  )
  if (result.exitCode !== 0) return null

  return result.stdout.split('\n').reduce(
    (stats, line) => {
      const [additions, deletions] = line.split('\t')
      const added = Number(additions)
      const removed = Number(deletions)
      if (Number.isFinite(added) && Number.isFinite(removed)) {
        stats.files += 1
        stats.additions += added
        stats.deletions += removed
      }
      return stats
    },
    { files: 0, additions: 0, deletions: 0 },
  )
}
