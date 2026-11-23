import {
  installationOctokit,
  loadAppConfigFromEnv,
  mintInstallationToken,
  parseRepoRef,
} from '@repo/github'
import { TEST_REPO_FULL_NAME } from './env.ts'

export interface FixtureBranch {
  readonly name: string
  delete(): Promise<void>
}

async function repoClient() {
  const repoRef = parseRepoRef(TEST_REPO_FULL_NAME)
  const token = await mintInstallationToken(loadAppConfigFromEnv(), repoRef)
  return { octokit: installationOctokit(token), owner: repoRef.owner, repo: repoRef.repo }
}

export async function createFixtureBranch(
  name: string,
  files: Record<string, string>,
): Promise<FixtureBranch> {
  const { octokit, owner, repo } = await repoClient()

  const { data: repository } = await octokit.rest.repos.get({ owner, repo })
  const { data: defaultRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${repository.default_branch}`,
  })
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${name}`,
    sha: defaultRef.object.sha,
  })

  for (const [path, content] of Object.entries(files)) {
    const existingSha = await fileSha(name, path)
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      branch: name,
      message: `e2e fixture: ${path}`,
      content: Buffer.from(content, 'utf8').toString('base64'),
      ...(existingSha ? { sha: existingSha } : {}),
    })
  }

  return {
    name,
    async delete() {
      await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${name}` }).catch(() => {})
    },
  }
}

export async function fileSha(ref: string, path: string): Promise<string | null> {
  const { octokit, owner, repo } = await repoClient()
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref })
    return Array.isArray(data) ? null : data.sha
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null
    throw error
  }
}

export async function openPullRequestTitles(): Promise<string[]> {
  const { octokit, owner, repo } = await repoClient()
  const { data } = await octokit.rest.pulls.list({ owner, repo, state: 'open', per_page: 100 })
  return data.map((pull) => pull.title)
}
