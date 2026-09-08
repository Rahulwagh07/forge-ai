'use client'

import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PanelLeftIcon } from '@hugeicons/core-free-icons'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { FilePanel } from '@/components/workspace/panels/file-panel'
import { TerminalPanel } from '@/components/workspace/panels/terminal-panel'
import type { DiffFileMeta, TerminalEntry } from '@/lib/types'

function FullscreenIcon({ size = 20, exit = false }: { size?: number; exit?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={
          exit
            ? 'M14 4v6h6M20 4l-7 7M10 20v-6H4M4 20l7-7'
            : 'M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7'
        }
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function AgentDock({
  entries,
  sessionId,
  diffFiles,
  fileCount,
  onClose,
}: {
  entries: TerminalEntry[]
  sessionId: string
  diffFiles: DiffFileMeta[]
  fileCount: number
  onClose: () => void
}) {
  const [tab, setTab] = useState('progress')
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  return (
    <section
      className={
        fullscreen
          ? 'absolute inset-0 z-50 flex min-h-0 flex-col bg-background'
          : 'flex min-h-0 flex-1 flex-col border-l-[0.5px]'
      }
    >
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(String(value))}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="flex h-10 shrink-0 items-center gap-2">
          <TabsList className="h-8 gap-0.5 bg-transparent">
            <TabsTrigger
              value="progress"
              className="rounded-md px-2 data-active:bg-secondary data-active:text-foreground dark:data-active:bg-secondary dark:data-active:border-transparent"
            >
              Progress
            </TabsTrigger>
            <TabsTrigger
              value="changes"
              className="rounded-md px-2 data-active:bg-secondary data-active:text-foreground dark:data-active:bg-secondary dark:data-active:border-transparent"
            >
              Changes
              {fileCount > 0 ? (
                <Badge variant="secondary" className="ml-0.5 h-4 px-1.5">
                  {fileCount}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close terminal"
              title="Close terminal"
            >
              <HugeiconsIcon icon={PanelLeftIcon} size={15} />
            </button>
            <button
              type="button"
              onClick={() => setFullscreen((value) => !value)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
              title={fullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
            >
              <FullscreenIcon size={15} exit={fullscreen} />
            </button>
          </div>
        </div>
        <TabsContent
          value="progress"
          className={
            fullscreen
              ? 'm-0 min-h-0 flex-1 overflow-hidden'
              : 'm-0 min-h-0 flex-1 overflow-hidden pt-3'
          }
        >
          <TerminalPanel entries={entries} />
        </TabsContent>
        <TabsContent
          value="changes"
          className={
            fullscreen
              ? 'm-0 min-h-0 flex-1 overflow-hidden'
              : 'm-0 min-h-0 flex-1 overflow-hidden border-t pt-3'
          }
        >
          <FilePanel sessionId={sessionId} files={diffFiles} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
