import 'server-only'
import { prisma } from 'db'
import { appOctokit, loadAppConfigFromEnv } from 'github'
import { log } from './log'

interface InstallationRepo {
  id: number
  full_name: string
  default_branch: string
}

export async function syncUserGithubInstallations(userId: string) {
  if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_APP_PRIVATE_KEY) {
    return null
  }
  const config = loadAppConfigFromEnv()
  const linkedInstallations = await prisma.githubInstallation.findMany({
    where: { userId },
    select: { id: true, installationId: true },
  })

  for (const installation of linkedInstallations) {
    try {
      const octokit = appOctokit(config, Number(installation.installationId))
      const repositoriesResponse = await octokit.request('GET /installation/repositories', {})
      const repos = repositoriesResponse.data.repositories as InstallationRepo[]

      for (const repo of repos) {
        await prisma.repo.upsert({
          where: { githubRepoId: BigInt(repo.id) },
          update: {
            fullName: repo.full_name,
            defaultBranch: repo.default_branch,
            installationId: installation.id,
          },
          create: {
            githubRepoId: BigInt(repo.id),
            fullName: repo.full_name,
            defaultBranch: repo.default_branch,
            installationId: installation.id,
          },
        })
      }

      const activeRepoIds = new Set(repos.map((repo) => BigInt(repo.id)))
      const existingRepos = await prisma.repo.findMany({
        where: { installationId: installation.id },
      })
      for (const existingRepo of existingRepos) {
        if (activeRepoIds.has(existingRepo.githubRepoId)) continue
        const sessionCount = await prisma.session.count({ where: { repoId: existingRepo.id } })
        if (sessionCount === 0) {
          await prisma.repo.delete({ where: { id: existingRepo.id } }).catch(() => {})
        }
      }
    } catch (err) {
      log.error('sync installation failed', {
        installationId: installation.installationId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return linkedInstallations[0] ?? null
}
