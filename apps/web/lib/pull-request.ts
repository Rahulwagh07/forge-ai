export type PrState = 'open' | 'closed' | 'merged'

export type PullRequestRef = { repoFullName: string; number: number }

const PR_URL_RE = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/

export function parsePullRequestUrl(url: string): PullRequestRef | null {
  const match = PR_URL_RE.exec(url)
  if (!match) return null
  return { repoFullName: match[1]!, number: Number(match[2]) }
}
