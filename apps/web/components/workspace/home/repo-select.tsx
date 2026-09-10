'use client'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, FolderGitIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { Menu } from '@base-ui/react/menu'
import { RepoAvatar } from '@/components/workspace/repo-avatar'
import { repoSlug } from '@/lib/repo'

type Repo = { id: string; fullName: string; defaultBranch: string }

export function RepoSelect({
  repos,
  selectedId,
  onSelect,
  onAddNew,
}: {
  repos: Repo[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddNew?: () => void
}) {
  const selected = repos.find((r) => r.id === selectedId) ?? null

  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex min-w-0 max-w-[12rem] cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 font-medium text-primary hover:opacity-80 focus-visible:outline-none"
        aria-label="Repository"
      >
        {selected ? (
          <RepoAvatar fullName={selected.fullName} size={18} />
        ) : (
          <HugeiconsIcon icon={FolderGitIcon} size={13} className="shrink-0" />
        )}
        <span className="truncate">
          {selected ? repoSlug(selected.fullName) : 'Select repository'}
        </span>
        <HugeiconsIcon icon={ArrowDown01Icon} size={12} className="shrink-0 opacity-70" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="start">
          <Menu.Popup className="max-h-64 w-64 overflow-auto rounded-lg bg-card p-1 text-sm text-card-foreground shadow-lg outline-none">
            {repos.map((repo) => (
              <Menu.Item
                key={repo.id}
                onClick={() => onSelect(repo.id)}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none hover:bg-muted data-highlighted:bg-muted"
              >
                <RepoAvatar fullName={repo.fullName} size={18} />
                <span className="min-w-0 flex-1 truncate">{repo.fullName}</span>
                {repo.id === selectedId ? (
                  <HugeiconsIcon icon={Tick02Icon} size={14} className="shrink-0 text-primary" />
                ) : null}
              </Menu.Item>
            ))}
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item
              onClick={() => onAddNew?.()}
              className="cursor-pointer rounded-sm px-2 py-1.5 outline-none hover:bg-muted data-highlighted:bg-muted"
            >
              Add new repository
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
