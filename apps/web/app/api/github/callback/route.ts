import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/auth'
import { prisma } from 'db'
import { appOctokit, loadAppConfigFromEnv } from 'github'
import { log } from '@/lib/log'

interface InstallationRepository {
  id: number
  full_name: string
  default_branch: string
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user || !session.userId) return NextResponse.redirect(new URL('/', req.url))

  const userId = session.userId

  const installationId = req.nextUrl.searchParams.get('installation_id')
  if (!installationId) {
    return NextResponse.json({ error: 'Missing installation_id' }, { status: 400 })
  }

  try {
    let repos: InstallationRepository[] = []
    let accountLogin = `installation-${installationId}`
    let accountType = 'User'

    if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
      const config = loadAppConfigFromEnv()
      const octokit = appOctokit(config, Number(installationId))

      try {
        const inst = await octokit.rest.apps.getInstallation({
          installation_id: Number(installationId),
        })
        const account = inst.data.account as {
          login?: string
          type?: string
        }
        accountLogin = account.login ?? accountLogin
        accountType = account.type ?? accountType
      } catch (e) {
        log.warn('failed to fetch installation account', {
          error: e instanceof Error ? e.message : String(e),
        })
      }

      try {
        const repoRes = await octokit.request('GET /installation/repositories', {})
        repos = repoRes.data.repositories as InstallationRepository[]
      } catch (e) {
        log.warn('failed to fetch installation repos', {
          error: e instanceof Error ? e.message : String(e),
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

    for (const r of repos) {
      await prisma.repo.upsert({
        where: { githubRepoId: BigInt(r.id) },
        update: {
          fullName: r.full_name,
          defaultBranch: r.default_branch,
          installationId: installation.id,
        },
        create: {
          githubRepoId: BigInt(r.id),
          fullName: r.full_name,
          defaultBranch: r.default_branch,
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
