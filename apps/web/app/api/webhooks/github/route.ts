import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { prisma } from 'db'
import { log } from '@/lib/log'

interface WebhookRepository {
  id: number
  full_name: string
  default_branch: string
}

interface InstallationPayload {
  installation?: { id: number; account?: { login?: string; type?: string } }
  action?: string
  repositories?: WebhookRepository[]
}

interface InstallationRepositoriesPayload {
  installation?: { id: number }
  repositories_added?: WebhookRepository[]
  repositories_removed?: WebhookRepository[]
}

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')

  if (secret && !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = req.headers.get('x-github-event')
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    if (event === 'installation') {
      const data = payload as InstallationPayload
      const installation = data.installation
      if (!installation?.id) return NextResponse.json({ ok: true, ignored: true })

      const installationId = String(installation.id)
      const accountLogin = installation.account?.login ?? ''
      const accountType = installation.account?.type ?? 'User'

      if (data.action === 'deleted') {
        const existing = await prisma.githubInstallation.findUnique({ where: { installationId } })
        if (existing) {
          await prisma.repo.deleteMany({ where: { installationId: existing.id } })
          await prisma.githubInstallation.delete({ where: { installationId } })
        }
        return NextResponse.json({ ok: true })
      }

      const existing = await prisma.githubInstallation.findUnique({ where: { installationId } })
      if (existing) {
        await prisma.githubInstallation.update({
          where: { installationId },
          data: { accountLogin, accountType },
        })
        for (const repo of data.repositories ?? []) {
          await prisma.repo.upsert({
            where: { githubRepoId: BigInt(repo.id) },
            update: { fullName: repo.full_name, defaultBranch: repo.default_branch },
            create: {
              githubRepoId: BigInt(repo.id),
              fullName: repo.full_name,
              defaultBranch: repo.default_branch,
              installationId: existing.id,
            },
          })
        }
      }
      return NextResponse.json({ ok: true })
    }

    if (event === 'installation_repositories') {
      const data = payload as InstallationRepositoriesPayload
      const installationId = data.installation?.id
      if (!installationId) return NextResponse.json({ ok: true, ignored: true })

      const installation = await prisma.githubInstallation.findUnique({
        where: { installationId: String(installationId) },
      })
      if (!installation) return NextResponse.json({ ok: true })

      for (const repo of data.repositories_added ?? []) {
        await prisma.repo.upsert({
          where: { githubRepoId: BigInt(repo.id) },
          update: { fullName: repo.full_name, defaultBranch: repo.default_branch },
          create: {
            githubRepoId: BigInt(repo.id),
            fullName: repo.full_name,
            defaultBranch: repo.default_branch,
            installationId: installation.id,
          },
        })
      }
      for (const repo of data.repositories_removed ?? []) {
        await prisma.repo.deleteMany({ where: { githubRepoId: BigInt(repo.id) } })
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true, ignored: true })
  } catch (err) {
    log.error('github webhook error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
