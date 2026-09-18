import type { CommandResult, SandboxHandle } from '@repo/sandbox'
import { shellQuote } from '@repo/sandbox'

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
  baseBranch: string,
  fetchBase: boolean,
  authUrl: string,
): string {
  const fetch = fetchBase
    ? `git fetch ${shellQuote(authUrl)} ${shellQuote(`${baseBranch}:refs/remotes/origin/${baseBranch}`)} --quiet >/dev/null 2>&1 || true; `
    : ''
  return `${fetch}git ls-files -z --others --exclude-standard -- . ':(exclude).forge/tool-output' ':(exclude).forge-tool-output' | xargs -0 -r git add -N --; `
}
