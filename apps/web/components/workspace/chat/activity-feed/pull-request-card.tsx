'use client'
import { HugeiconsIcon } from '@hugeicons/react'
import { GitBranchIcon } from '@hugeicons/core-free-icons'
import type { PullRequestInfo } from '@/lib/types'

export function PullRequestCard({ pr }: { pr: PullRequestInfo }) {
  const iconColor =
    pr.state === 'closed' ? 'text-danger' : pr.state === 'merged' ? 'text-merged' : 'text-success'
  return (
    <div className="mt-3 rounded-xl border bg-muted/50 p-3">
      <div className="flex items-center gap-2 text-sm">
        <HugeiconsIcon icon={GitBranchIcon} size={14} className={iconColor} />
        <span className="font-semibold">Changes ready for review</span>
        {pr.files !== undefined ? (
          <span className="ml-auto text-sm text-muted-foreground">
            {pr.files} {pr.files === 1 ? 'file' : 'files'}
          </span>
        ) : null}
      </div>
      <div className="mt-2 truncate text-sm font-medium">
        {pr.repoFullName ? `${pr.repoFullName} #${pr.number}` : (pr.title ?? 'Agent changes')}
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        {pr.additions !== undefined ? <span className="text-success">+{pr.additions}</span> : null}
        {pr.deletions !== undefined ? <span className="text-danger">-{pr.deletions}</span> : null}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-neutral-950 px-2.5 py-1.5 text-sm font-medium text-white outline-none hover:bg-neutral-950/90 dark:bg-white dark:text-neutral-950 dark:hover:bg-white/90"
        >
          Review pull request
        </a>
      </div>
    </div>
  )
}
