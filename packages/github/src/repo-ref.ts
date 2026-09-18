export interface RepoRef {
  owner: string
  repo: string
}

export function parseRepoRef(value: string): RepoRef {
  const trimmed = value.trim()
  const scpMatch = /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(trimmed)
  if (scpMatch) return { owner: scpMatch[1]!, repo: scpMatch[2]! }

  const fullNameMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(trimmed)
  if (fullNameMatch) return { owner: fullNameMatch[1]!, repo: fullNameMatch[2]! }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error(`cannot parse owner/repo from: ${value}`)
  }
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
    throw new Error(`cannot parse owner/repo from: ${value}`)
  }
  if (url.search || url.hash) throw new Error(`cannot parse owner/repo from: ${value}`)
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 2) throw new Error(`cannot parse owner/repo from: ${value}`)
  if (!/^[A-Za-z0-9_.-]+$/.test(parts[0]!)) {
    throw new Error(`cannot parse owner/repo from: ${value}`)
  }
  const repo = parts[1]!.replace(/\.git$/, '')
  if (!/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error(`cannot parse owner/repo from: ${value}`)
  }
  return { owner: parts[0]!, repo }
}

export function tokenEmbedUrl(token: string, repo: RepoRef): string {
  return `https://x-access-token:${token}@github.com/${repo.owner}/${repo.repo}.git`
}
