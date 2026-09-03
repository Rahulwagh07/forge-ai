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
  const linked = await prisma.githubInstallation.findMany({
    where: { userId },
    select: { id: true, installationId: true },
  })

  for (const inst of linked) {
    try {
      const octokit = appOctokit(config, Number(inst.installationId))
      const repoRes = await octokit.request('GET /installation/repositories', {})
      const repos = repoRes.data.repositories as InstallationRepo[]

      for (const r of repos) {
        await prisma.repo.upsert({
          where: { githubRepoId: BigInt(r.id) },
          update: {
            fullName: r.full_name,
            defaultBranch: r.default_branch,
            installationId: inst.id,
          },
          create: {
            githubRepoId: BigInt(r.id),
            fullName: r.full_name,
            defaultBranch: r.default_branch,
            installationId: inst.id,
          },
        })
      }

      const ids = new Set(repos.map((r) => BigInt(r.id)))
      const existing = await prisma.repo.findMany({ where: { installationId: inst.id } })
      for (const er of existing) {
        if (!ids.has(er.githubRepoId)) {
          const hasSessions = await prisma.session.count({ where: { repoId: er.id } })
          if (hasSessions === 0) {
            await prisma.repo.delete({ where: { id: er.id } }).catch(() => {})
          }
        }
      }
    } catch (err) {
      log.error('sync installation failed', {
        installationId: inst.installationId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return linked[0] ?? null
}
