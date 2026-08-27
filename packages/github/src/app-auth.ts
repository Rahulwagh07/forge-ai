import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from 'octokit'

/**
 * GitHub App auth
 *
 * The private key never enters the
 * sandbox; the sandbox receives a short-lived (~1h) installation access token
 * embedded into the git clone URL
 */

export interface GitHubAppConfig {
  appId: string
  privateKey: string
}

export function loadAppConfigFromEnv(): GitHubAppConfig {
  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY
  if (!appId || !privateKey) {
    throw new Error(
      '[github] GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required'
    )
  }
  return { appId, privateKey: normalizePem(privateKey) }
}

function normalizePem(key: string): string {
  return key.replaceAll('\\n', '\n')
}

function appOctokit(config: GitHubAppConfig): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.appId,
      privateKey: config.privateKey,
    },
  })
}

export interface RepoRef {
  owner: string
  repo: string
}

/**
 * Mint a one-repo-scoped installation token (Contents+PRs write).
 * Expires ~1 hour; never persisted, dies with the session.
 */
export async function mintInstallationToken(
  config: GitHubAppConfig,
  repo: RepoRef
): Promise<string> {
  const octokit = appOctokit(config)

  // find the installation for exactly this repo.
  const installation = await octokit.rest.apps.getRepoInstallation({
    owner: repo.owner,
    repo: repo.repo,
  })

  const token = await octokit.rest.apps.createInstallationAccessToken({
    installation_id: installation.data.id,
    permissions: {
      contents: 'write',
      pull_requests: 'write',
      metadata: 'read',
    },
  })

  return token.data.token
}

export function installationOctokit(token: string): Octokit {
  return new Octokit({ auth: token })
}

export function parseRepoRef(cloneUrl: string): RepoRef {
  const match = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(cloneUrl)
  if (!match) {
    throw new Error(`[github] cannot parse owner/repo from: ${cloneUrl}`)
  }
  return { owner: match[1]!, repo: match[2]! }
}

export function tokenEmbedUrl(token: string, repo: RepoRef): string {
  return `https://x-access-token:${token}@github.com/${repo.owner}/${repo.repo}.git`
}
