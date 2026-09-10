import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/auth'
import { prisma } from 'db'
import { appOctokit, loadAppConfigFromEnv } from 'github'
import { log } from '@/lib/log'
import { parseQuery } from '@/lib/validation'
import { installationIdQuerySchema } from '@/lib/schemas/github-callback'

interface InstallationRepository {
  id: number
  full_name: string
  default_branch: string
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user || !session.userId) return NextResponse.redirect(new URL('/', req.url))

  const userId = session.userId

  const parsed = parseQuery(req.nextUrl, installationIdQuerySchema)
  if ('error' in parsed) return parsed.error
  const installationId = parsed.data.installation_id

  try {
    let repos: InstallationRepository[] = []
    let accountLogin = `installation-${installationId}`
    let accountType = 'User'

    if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
      const config = loadAppConfigFromEnv()
      const octokit = appOctokit(config, Number(installationId))

      try {
        const installationResponse = await octokit.rest.apps.getInstallation({
          installation_id: Number(installationId),
        })
        const account = installationResponse.data.account as {
          login?: string
          type?: string
        }
        accountLogin = account.login ?? accountLogin
        accountType = account.type ?? accountType
      } catch (error) {
        log.warn('failed to fetch installation account', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      try {
        const repositoriesResponse = await octokit.request('GET /installation/repositories', {})
        repos = repositoriesResponse.data.repositories as InstallationRepository[]
      } catch (error) {
        log.warn('failed to fetch installation repos', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const installation = await prisma.githubInstallation.upsert({
      where: { installationId: String(installationId) },
      update: { accountLogin, accountType, userId },
      create: {
        installationId: String(installationId),
        accountLogin,
        accountType,
        userId,
      },
    })

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

    return NextResponse.redirect(new URL('/', req.url))
  } catch (err) {
    log.error('github callback failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Failed to store installation' }, { status: 500 })
  }
}
