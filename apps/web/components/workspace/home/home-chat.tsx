'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon, GitBranchIcon } from '@hugeicons/core-free-icons'
import { RepoSelectModal } from '@/components/workspace/home/repo-select-modal'
import { Composer } from '@/components/workspace/chat/composer'
import { createSession, syncRepositories } from '@/lib/api'
import { DEFAULT_BRANCH_LABEL, GITHUB_INSTALLATIONS_URL } from '@/lib/constants'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Repo = { id: string; fullName: string; defaultBranch: string }

export function HomeChat({
  repos,
  installationId,
}: {
  repos: Repo[]
  installationId: string | null
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'ask' | 'agent'>('ask')
  const [selectedId, setSelectedId] = useState<string | null>(repos[0]?.id ?? null)
  const [repoModalOpen, setRepoModalOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const selected = repos.find((r) => r.id === selectedId) ?? null

  async function handleSync() {
    setSyncing(true)
    try {
      await syncRepositories()
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleSubmit(msg: string) {
    if (!selectedId || !msg.trim()) return
    try {
      const data = await createSession({
        repoId: selectedId,
        prompt: msg.trim(),
        mode: mode.toUpperCase() as 'ASK' | 'AGENT',
      })
      router.push(`/sessions/${data.sessionId}`)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create session')
    }
  }

  if (repos.length === 0) {
    return (
      <div className="w-full max-w-3xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Forge</span>
          </div>
          <div className="flex rounded-full bg-muted p-1">
            <button
              onClick={() => setMode('agent')}
              className={`rounded-full px-3 py-1 text-sm ${mode === 'agent' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              Agent
            </button>
            <button
              onClick={() => setMode('ask')}
              className={`rounded-full px-3 py-1 text-sm ${mode === 'ask' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              Ask
            </button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            onSend={async () => {}}
            placeholder="Ask Forge questions about your code"
            disabled
          />
        </div>
        <div className="mt-3 flex justify-center">
          <a
            href="/connect-github"
            className="rounded-full border bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80"
          >
            Install GitHub App to connect repos
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Forge</span>
        </div>
        <div className="flex rounded-full bg-muted p-1">
          <button
            onClick={() => setMode('agent')}
            className={`rounded-full px-3 py-1 text-sm ${mode === 'agent' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            Agent
          </button>
          <button
            onClick={() => setMode('ask')}
            className={`rounded-full px-3 py-1 text-sm ${mode === 'ask' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            Ask
          </button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl">
        <Composer onSend={handleSubmit} placeholder="Ask Forge questions about your code" />
      </div>
      <div className="mt-3 flex items-center gap-1 text-sm">
        <button
          onClick={() => setRepoModalOpen(true)}
          className="flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          <HugeiconsIcon icon={Folder01Icon} size={14} className="text-primary" />
          <span>{selected?.fullName ?? 'Select repository'}</span>
        </button>
        <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground">
          <HugeiconsIcon icon={GitBranchIcon} size={12} />
          <span>{selected?.defaultBranch ?? DEFAULT_BRANCH_LABEL} (default)</span>
        </span>
      </div>
      <RepoSelectModal
        open={repoModalOpen}
        onOpenChange={setRepoModalOpen}
        repos={repos}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onAddNew={() => {
          setRepoModalOpen(false)
          setInfoOpen(true)
        }}
      />
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add new repository</DialogTitle>
            <DialogDescription>
              Go to your GitHub App installation to add or remove repositories. After changing, come
              back and sync.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium">Your installation</div>
            <a
              href={
                installationId
                  ? `${GITHUB_INSTALLATIONS_URL}/${installationId}`
                  : GITHUB_INSTALLATIONS_URL
              }
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-primary underline"
            >
              {installationId
                ? `${GITHUB_INSTALLATIONS_URL}/${installationId}`
                : GITHUB_INSTALLATIONS_URL}
            </a>
            <div className="mt-2 text-muted-foreground">
              1. Open the link → 2. Under “Repository access” select repositories → 3. Save → 4.
              Click Sync below.
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setInfoOpen(false)}>
              Close
            </Button>
            <Button disabled={syncing} onClick={handleSync}>
              {syncing ? 'Syncing...' : 'Sync repositories'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
