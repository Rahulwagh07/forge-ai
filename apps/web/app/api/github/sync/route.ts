import { NextResponse } from 'next/server'
import { prisma } from 'db'
import { syncUserGithubInstallations } from '@/lib/github-sync'
import { requireUser } from '@/lib/auth-guards'
import { env } from '@/env'
import { log } from '@/lib/log'

export async function POST() {
  const user = await requireUser()
  if ('error' in user) return user.error
  const userId = user.data.userId

  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    return NextResponse.json({ error: 'GitHub App not configured' }, { status: 500 })
  }

  try {
    const installation = await syncUserGithubInstallations(userId)
    if (!installation) {
      return NextResponse.json({ error: 'No installation found' }, { status: 404 })
    }

    const repos = await prisma.repo.findMany({
      where: { installationId: installation.id },
      select: { fullName: true },
    })

    return NextResponse.json({
      synced: repos.length,
      repos: repos.map((r) => r.fullName),
    })
  } catch (err) {
    log.error('github sync error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Repository sync failed' }, { status: 500 })
  }
}
