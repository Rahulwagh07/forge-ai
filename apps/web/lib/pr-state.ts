import 'server-only'
import {
  installationOctokit,
  loadAppConfigFromEnv,
  mintInstallationToken,
  type RepoRef,
} from '@repo/github'
import { env } from '@/env'
import type { PrState } from './pull-request'

export async function getPullRequestState(
  repo: RepoRef,
  pullNumber: number,
): Promise<PrState | null> {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    return null
  }
  try {
    const config = loadAppConfigFromEnv()
    const token = await mintInstallationToken(config, repo)
    const res = await installationOctokit(token).rest.pulls.get({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: pullNumber,
    })
    return res.data.merged ? 'merged' : (res.data.state as 'open' | 'closed')
  } catch {
    return null
  }
}
