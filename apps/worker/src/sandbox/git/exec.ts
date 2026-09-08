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

export function fetchBaseAndStageUntracked(
  defaultBranch: string,
  fetchBase: boolean,
  authUrl: string,
): string {
  const fetch = fetchBase
    ? `git fetch ${shellQuote(authUrl)} ${shellQuote(`${defaultBranch}:refs/remotes/origin/${defaultBranch}`)} --quiet >/dev/null 2>&1 || true; `
    : ''
  return `${fetch}git ls-files --others --exclude-standard -z | xargs -0 -r git add -N --; `
}
