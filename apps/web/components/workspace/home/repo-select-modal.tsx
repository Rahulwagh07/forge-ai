'use client'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon } from '@hugeicons/core-free-icons'

type Repo = { id: string; fullName: string; defaultBranch: string }

export function RepoSelectModal({
  open,
  onOpenChange,
  repos,
  selectedId,
  onSelect,
  onAddNew,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  repos: Repo[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddNew?: () => void
}) {
  const [temp, setTemp] = useState<string | null>(selectedId)

  function handleConfirm() {
    if (temp) onSelect(temp)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl gap-0 bg-card p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle className="text-base">Select a repository</DialogTitle>
          <DialogDescription className="text-sm">
            Choose the repository Forge should work on
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-auto px-2">
          {repos.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No repositories found
            </div>
          ) : (
            repos.map((r) => {
              const active = temp === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setTemp(r.id)}
                  className={`flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-sm hover:bg-muted/40 ${active ? 'bg-muted/60' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{r.fullName}</span>
                  {active ? (
                    <HugeiconsIcon icon={Tick02Icon} size={16} className="shrink-0 text-primary" />
                  ) : null}
                </button>
              )
            })
          )}
        </div>
        <DialogFooter className="flex items-center justify-between px-6 py-4">
          <Button variant="outline" size="sm" onClick={() => onAddNew?.()}>
            Add new repository
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!temp}
              onClick={handleConfirm}
              className="bg-white text-black hover:bg-white/90"
            >
              Select repository
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
