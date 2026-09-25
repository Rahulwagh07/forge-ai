'use client'

import { useState } from 'react'
import { ApiError, syncRepositories } from '@/lib/api'

export function SyncRepositoriesButton() {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sync() {
    setSyncing(true)
    setError(null)
    try {
      await syncRepositories()
      window.location.reload()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setError(
          'No GitHub installation found yet. Click Connect GitHub above and approve access, then try again.',
        )
      } else {
        setError('Repository sync failed. Please try again.')
      }
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={sync}
        disabled={syncing}
        className="rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/80 disabled:opacity-50"
      >
        {syncing ? 'Syncing repositories...' : 'Refresh repositories'}
      </button>
      {error ? (
        <p role="alert" className="max-w-sm text-sm leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
