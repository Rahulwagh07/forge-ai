import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/workspace/shell/app-sidebar'
import { CollapsedSidebarTrigger } from '@/components/workspace/shell/collapsed-sidebar-trigger'
import { getSession } from '@/auth'
import { prisma } from '@repo/db'
import type { SessionSummary } from '@/lib/api'

export const metadata: Metadata = {
  title: 'Forge - AI software engineer',
  description:
    'Forge is an AI software engineer. Describe the task, it reads your repo, writes the code in an isolated sandbox, runs the tests, and opens a PR for you to review.',
}

export const viewport = {
  themeColor: '#ffffff',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getSession().catch(() => null)
  const userId = session?.userId
  const user = userId
    ? await prisma.user
        .findUnique({
          where: { id: userId },
          select: { name: true, email: true, avatarUrl: true },
        })
        .catch(() => null)
    : null
  const recentSessions: SessionSummary[] = userId
    ? (
        await prisma.session
          .findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: {
              id: true,
              prompt: true,
              createdAt: true,
              status: true,
              repo: { select: { fullName: true } },
            },
          })
          .catch(() => [])
      ).map((s) => ({
        id: s.id,
        prompt: s.prompt,
        createdAt: s.createdAt.toISOString(),
        status: s.status,
        repoFullName: s.repo?.fullName,
      }))
    : []

  const cookieStore = await cookies()
  const theme = cookieStore.get('forge-theme')?.value === 'dark' ? 'dark' : 'light'

  return (
    <html lang="en" suppressHydrationWarning className={`font-sans ${theme}`}>
      <body suppressHydrationWarning className="bg-background text-foreground">
        <TooltipProvider>
          {session?.user && userId ? (
            <SidebarProvider defaultOpen={true}>
              <AppSidebar user={user} recentSessions={recentSessions} />
              <SidebarInset>
                <CollapsedSidebarTrigger />
                <div className="relative flex h-full min-h-0 flex-1 flex-col">{children}</div>
              </SidebarInset>
            </SidebarProvider>
          ) : (
            <div className="flex min-h-svh flex-col">{children}</div>
          )}
        </TooltipProvider>
      </body>
    </html>
  )
}
