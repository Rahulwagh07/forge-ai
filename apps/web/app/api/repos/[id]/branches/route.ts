import { NextRequest, NextResponse } from 'next/server'
import { prisma } from 'db'
import { appOctokit, loadAppConfigFromEnv } from 'github'
import { requireUser } from '@/lib/auth-guards'
import { log } from '@/lib/log'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: repoId } = await params

  const user = await requireUser()
  if ('error' in user) return user.error
  const userId = user.data.userId

  const repo = await prisma.repo.findUnique({
    where: { id: repoId },
    include: { installation: true },
  })
  if (!repo) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
  }
  if (repo.installation.userId !== userId) {
    return NextResponse.json({ error: 'Not authorized for this repo' }, { status: 403 })
  }

  try {
    const [owner, name] = repo.fullName.split('/')
    if (!owner || !name) {
      return NextResponse.json({ error: 'Invalid repository name' }, { status: 500 })
    }
    const config = loadAppConfigFromEnv()
    const octokit = appOctokit(config, Number(repo.installation.installationId))
    const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
      owner,
      repo: name,
      per_page: 100,
    })
    return NextResponse.json({
      defaultBranch: repo.defaultBranch,
      branches: branches.map((branch) => branch.name),
    })
  } catch (error) {
    log.error('failed to list branches', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Failed to list branches' }, { status: 500 })
  }
}
