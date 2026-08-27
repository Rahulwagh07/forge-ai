import type { Octokit } from 'octokit'
import type { RepoRef } from './app-auth.ts'

export async function findOrCreatePr(
  octokit: Octokit,
  repo: RepoRef,
  pr: { head: string; base: string; title: string; body?: string }
): Promise<{ url: string; created: boolean }> {
  const existing = await octokit.rest.pulls.list({
    owner: repo.owner,
    repo: repo.repo,
    head: `${repo.owner}:${pr.head}`,
    base: pr.base,
    state: 'open',
  })

  if (existing.data.length > 0) {
    return { url: existing.data[0]!.html_url, created: false }
  }

  const created = await octokit.rest.pulls.create({
    owner: repo.owner,
    repo: repo.repo,
    head: pr.head,
    base: pr.base,
    title: pr.title,
    body: pr.body,
  })

  return { url: created.data.html_url, created: true }
}
