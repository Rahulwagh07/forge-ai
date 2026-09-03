'use client'

import { useSidebar } from '@/components/ui/sidebar'
import { HugeiconsIcon } from '@hugeicons/react'
import { PanelLeftIcon } from '@hugeicons/core-free-icons'

export function CollapsedSidebarTrigger() {
  const { state, toggleSidebar } = useSidebar()
  if (state !== 'collapsed') return null
  return (
    <button
      onClick={toggleSidebar}
      className="absolute left-2 top-2 z-20 rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      aria-label="Open sidebar"
    >
      <HugeiconsIcon icon={PanelLeftIcon} size={14} />
    </button>
  )
}
