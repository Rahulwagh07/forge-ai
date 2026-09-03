import { getSession } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from 'db'
import { WorkspaceLayout } from '@/components/workspace/shell/workspace-layout'
import { parsePullRequestUrl, type PrState } from '@/lib/pull-request'
import { getPullRequestState } from '@/lib/pr-state'
import type { StoredStep } from '@/lib/types'

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session?.user) redirect('/')
  const userId = session.userId
  if (!userId) redirect('/')

  const dbSession = await prisma.session.findUnique({
    where: { id },
    include: {
      repo: true,
      steps: { orderBy: [{ stepNumber: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] },
    },
  })
  if (!dbSession) {
    return <div className="p-6 text-sm">Session not found</div>
  }
  if (dbSession.userId !== userId) {
    return <div className="p-6 text-sm">Not authorized for this session</div>
  }

  const steps: StoredStep[] = dbSession.steps.map((step) => ({
    type: step.type,
    content: (step.content ?? {}) as StoredStep['content'],
    createdAt: step.createdAt.toISOString(),
  }))

  let initialPrState: PrState | undefined
  if (dbSession.prUrl) {
    const ref = parsePullRequestUrl(dbSession.prUrl)
    if (ref) {
      const [owner, repo] = ref.repoFullName.split('/')
      if (owner && repo) {
        initialPrState = (await getPullRequestState({ owner, repo }, ref.number)) ?? undefined
      }
    }
  }

  return (
    <main className="flex h-full min-h-0 w-full flex-1 flex-col px-3 md:px-4 xl:px-6">
      <WorkspaceLayout
        sessionId={id}
        initialSteps={steps}
        initialStatus={dbSession.status}
        initialPrompt={dbSession.prompt}
        mode={dbSession.mode}
        initialBranchName={dbSession.branchName}
        initialPrUrl={dbSession.prUrl}
        initialPrState={initialPrState}
      />
    </main>
  )
}
