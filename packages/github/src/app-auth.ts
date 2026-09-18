import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from 'octokit'
import type { RepoRef } from './repo-ref.ts'

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
    throw new Error('[github] GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required')
  }
  return { appId, privateKey: normalizePem(privateKey) }
}

function normalizePem(key: string): string {
  return key.replaceAll('\\n', '\n')
}

export function appOctokit(config: GitHubAppConfig, installationId?: number): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.appId,
      privateKey: config.privateKey,
      ...(installationId !== undefined ? { installationId } : {}),
    },
  })
}

export async function mintInstallationToken(
  config: GitHubAppConfig,
  repo: RepoRef,
): Promise<string> {
  const octokit = appOctokit(config)

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
      administration: 'write',
    },
  })

  return token.data.token
}

export function installationOctokit(token: string): Octokit {
  return new Octokit({ auth: token })
}
