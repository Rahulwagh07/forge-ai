const REPO_ROOT = '/workspace/repo'

export function assertSafePath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0) return 'path must be a non-empty string'
  if (!path.startsWith('/')) return `blocked: path must be absolute inside ${REPO_ROOT}`
  const normalized = normalize(path)
  if (normalized !== REPO_ROOT && !normalized.startsWith(`${REPO_ROOT}/`))
    return `blocked: path must stay inside ${REPO_ROOT}`
  return null
}

function normalize(path: string): string {
  const parts: string[] = []
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return `/${parts.join('/')}`
}

const BLOCKED_COMMAND_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /(^|[;&|])\s*rm\s+[^|;]*-[a-z]*r[a-z]*f/, reason: 'recursive delete' },
  { re: /rm\s+-rf?\s+(\/|\/\*|~)/, reason: 'root/home delete' },
  { re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/, reason: 'fork bomb' },
  { re: /\bmkfs\b|\bdd\s+.*of=\/dev\//, reason: 'disk destroy' },
  { re: /chmod\s+-R\s+777\s+\//, reason: 'chmod root' },
  { re: /git\s+push\s+.*(--force|-f\b)/, reason: 'force push (prompt rule, now enforced)' },
  { re: /git\s+(filter-branch|filter-repo)/, reason: 'history rewrite' },
]

export function blockedCommandReason(cmd: unknown): string | null {
  if (typeof cmd !== 'string' || cmd.length === 0) return 'cmd must be a non-empty string'
  for (const { re, reason } of BLOCKED_COMMAND_PATTERNS) {
    if (re.test(cmd)) return `blocked: ${reason}`
  }
  return null
}
