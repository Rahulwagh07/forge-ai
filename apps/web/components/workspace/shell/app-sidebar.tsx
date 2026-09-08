'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useHotkeys } from 'react-hotkeys-hook'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, PanelLeftIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { LogoutButton } from '@/components/workspace/shell/logout-button'
import { SearchDialog } from '@/components/workspace/shell/search-dialog'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar'
import { listSessions, type SessionSummary } from '@/lib/api'
import { SESSION_LIST_REFRESH_MS } from '@/lib/constants'
import { UserAvatar } from '@/components/workspace/shell/user-avatar'
import { timeAgo } from '@/lib/utils'

export function AppSidebar({
  user,
  recentSessions,
}: {
  user?: {
    name?: string | null
    email?: string | null
    avatarUrl?: string | null
  } | null
  recentSessions: SessionSummary[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { toggleSidebar } = useSidebar()
  const [sessions, setSessions] = useState(recentSessions)
  const [searchOpen, setSearchOpen] = useState(false)

  useHotkeys('ctrl+k', (event) => {
    event.preventDefault()
    setSearchOpen((open) => !open)
  })
  useHotkeys('ctrl+shift+0', (event) => {
    event.preventDefault()
    router.push('/')
  })

  useEffect(() => {
    setSessions(recentSessions)
  }, [recentSessions])

  useEffect(() => {
    if (pathname === '/connect-github') return
    const refresh = async () => {
      try {
        const data = await listSessions()
        setSessions(data.sessions)
      } catch {}
    }
    const timer = window.setInterval(() => {
      void refresh()
    }, SESSION_LIST_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [pathname])

  if (pathname === '/connect-github') return null

  return (
    <Sidebar className="bg-sidebar text-sidebar-foreground">
      <SidebarHeader>
        <div className="flex items-center justify-between px-2 py-1">
          <UserAvatar user={user} size={6} />
          <div className="flex items-center gap-1 text-muted-foreground">
            <button
              onClick={() => setSearchOpen(true)}
              className="rounded p-1.5 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Search sessions"
              title="Search sessions (Ctrl+K)"
            >
              <HugeiconsIcon icon={Search01Icon} size={15} />
            </button>
            <button
              onClick={toggleSidebar}
              className="rounded p-1.5 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <HugeiconsIcon icon={PanelLeftIcon} size={14} />
            </button>
          </div>
        </div>
        <Link
          href="/"
          title="New session (Ctrl+Shift+0)"
          className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-sidebar-accent ${pathname === '/' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}`}
        >
          <HugeiconsIcon icon={Add01Icon} size={14} /> New session
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="px-2 py-1 text-sm text-foreground">Recent Sessions</div>
            <SidebarMenu className="gap-2">
              {sessions.length === 0 ? (
                <div className="px-2 py-2 text-sm text-muted-foreground">No sessions yet</div>
              ) : (
                sessions.map((s) => {
                  const active = pathname === `/sessions/${s.id}`
                  return (
                    <SidebarMenuItem key={s.id}>
                      <SidebarMenuButton
                        isActive={active}
                        className="h-auto flex-col items-start gap-1 py-2.5"
                        onClick={() => router.push(`/sessions/${s.id}`)}
                      >
                        <span className="flex w-full items-center gap-1.5 text-sm leading-snug">
                          {s.status === 'RUNNING' ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success"
                              aria-label="Running"
                            />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate">{s.prompt}</span>
                        </span>
                        <span className="flex w-full items-center gap-1.5 text-xs text-muted-foreground">
                          {s.repoFullName ? (
                            <span className="min-w-0 flex-1 truncate">{s.repoFullName}</span>
                          ) : null}
                          <span suppressHydrationWarning className="shrink-0">
                            {timeAgo(s.createdAt)}
                          </span>
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-2">
          <UserAvatar user={user} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user?.name ?? 'User'}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email ?? ''}</div>
          </div>
          <LogoutButton />
        </div>
      </SidebarFooter>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </Sidebar>
  )
}
