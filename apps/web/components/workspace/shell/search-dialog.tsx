'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { listSessions, searchSessions, type SessionSummary } from '@/lib/api'

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SessionSummary[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = setTimeout(
      async () => {
        try {
          const data = query.trim() ? await searchSessions(query.trim()) : await listSessions()
          if (!cancelled) setResults(data.sessions)
        } catch {}
      },
      query.trim() ? 200 : 0,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg gap-0 p-0">
        <div className="flex items-center gap-2 px-3 py-2">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions..."
            className="h-9 min-w-0 flex-1 border-0 bg-transparent pl-2 text-sm"
          />
        </div>
        <ScrollArea className="h-80">
          <div className="p-1">
            {results.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No matching sessions
              </div>
            ) : (
              results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onOpenChange(false)
                    router.push(`/sessions/${s.id}`)
                  }}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="line-clamp-1 w-full text-sm text-foreground">{s.prompt}</span>
                  <span className="text-xs text-muted-foreground">{s.repoFullName ?? ''}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
