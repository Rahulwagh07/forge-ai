import { getSession } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from 'db'
import { HomeChat } from '@/components/workspace/home/home-chat'
import { SignIn } from '@/components/workspace/home/sign-in'

export default async function Home() {
  const session = await getSession()
  if (!session?.user) {
    return <SignIn />
  }

  const userId = session.userId
  if (!userId) redirect('/')
  const repos = await prisma.repo.findMany({
    where: { installation: { userId } },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, defaultBranch: true },
  })
  const installation = await prisma.githubInstallation.findFirst({
    where: { userId },
    select: { installationId: true },
  })

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8">
      <HomeChat repos={repos} installationId={installation?.installationId ?? null} />
    </main>
  )
}
