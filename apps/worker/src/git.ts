import type { CommandResult, SandboxHandle } from 'sandbox'

const REPO_DIR = '/workspace/repo'

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function gitAuthFlags(): string {
  return `-c "remote.origin.url=https://x-access-token:$${AUTH_TOKEN_ENV}@$(git remote get-url origin | sed 's#^https://##')"`
}

const AUTH_TOKEN_ENV = 'FORGE_GIT_TOKEN'

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

export async function getDiffSnapshot(
  sandbox: SandboxHandle,
  defaultBranch: string,
  fetchBase: boolean,
): Promise<string> {
  const base = shellQuote(`origin/${defaultBranch}`)
  const fetch = fetchBase
    ? `git ${gitAuthFlags()} fetch origin ${shellQuote(`${defaultBranch}:refs/remotes/origin/${defaultBranch}`)} --quiet >/dev/null 2>&1 || true; `
    : ''
  const result = await runInRepo(
    sandbox,
    `${fetch}git ls-files --others --exclude-standard -z | xargs -0 -r git add -N --; git diff --no-ext-diff --unified=3 ${base} --`,
    { timeoutMs: 30_000 },
  )
  if (result.exitCode === 0 && result.stdout.trim()) return result.stdout

  const fallback = await runInRepo(sandbox, 'git diff --no-ext-diff --unified=3 HEAD --', {
    timeoutMs: 30_000,
  })
  return fallback.exitCode === 0 ? fallback.stdout : ''
}

export async function getChangeStats(
  sandbox: SandboxHandle,
  defaultBranch: string,
  fetchBase: boolean,
): Promise<{ files: number; additions: number; deletions: number }> {
  const fetch = fetchBase
    ? `git ${gitAuthFlags()} fetch origin ${shellQuote(`${defaultBranch}:refs/remotes/origin/${defaultBranch}`)} --quiet >/dev/null 2>&1 || true; `
    : ''
  const result = await runInRepo(
    sandbox,
    `${fetch}git diff --numstat ${shellQuote(`origin/${defaultBranch}`)} --`,
    { timeoutMs: 30_000 },
  )
  if (result.exitCode !== 0) return { files: 0, additions: 0, deletions: 0 }

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
