import { getSession } from '@/auth'
import { redirect } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { GithubIcon } from '@hugeicons/core-free-icons'
import { prisma } from 'db'
import { SyncRepositoriesButton } from '@/components/workspace/home/sync-repositories-button'
import { syncUserGithubInstallations } from '@/lib/github-sync'
import { API, GITHUB_INSTALLATIONS_URL } from '@/lib/constants'
import { log } from '@/lib/log'

export default async function ConnectGithubPage() {
  const session = await getSession()
  if (!session?.user) redirect('/')
  const userId = session.userId
  if (!userId) redirect('/')

  // sync installations and repos on page load
  let installationsCount = 0
  if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
    try {
      await syncUserGithubInstallations(userId)
      installationsCount = await prisma.githubInstallation.count({
        where: { userId },
      })
    } catch (error) {
      log.error('failed to auto-discover installations on load', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  } else {
    installationsCount = await prisma.githubInstallation.count({
      where: { userId },
    })
  }

  // If we have an installation with repositories, redirect straight to "/"
  if (installationsCount > 0) {
    const reposCount = await prisma.repo.count({
      where: { installation: { userId } },
    })
    if (reposCount > 0) {
      redirect('/')
    }
  }

  const slug = process.env.GITHUB_APP_SLUG
  const callbackUrl = `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}${API.githubCallback}`
  const installUrl = slug
    ? `https://github.com/apps/${slug}/installations/new`
    : GITHUB_INSTALLATIONS_URL

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6 py-16 font-sans">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground">
          <HugeiconsIcon icon={GithubIcon} size={24} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect your Git provider</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          Connect your repositories so Forge can start working.
        </p>
        <a
          href={installUrl}
          className="mt-8 flex h-10 w-full max-w-sm items-center justify-center gap-2 rounded-md px-4 text-sm font-medium btn-google shadow-sm transition-colors"
        >
          <HugeiconsIcon icon={GithubIcon} size={17} />
          Connect GitHub
        </a>
        <p className="mt-4 max-w-sm text-xs leading-5 text-muted-foreground">
          Choose all repositories or only the ones you want Forge to access. You can select a
          repository and start your first session when you return.
        </p>
        <SyncRepositoriesButton />
        <p className="mt-5 max-w-sm text-xs leading-5 text-muted-foreground/70">
          GitHub App Setup URL: <code>{callbackUrl}</code>
        </p>
      </div>
    </main>
  )
}
