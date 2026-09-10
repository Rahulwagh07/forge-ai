'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
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
import { UserAvatar } from '@/components/workspace/shell/user-avatar'
import { RepoAvatar } from '@/components/workspace/repo-avatar'
import { RunningRepoAvatar } from '@/components/workspace/running-repo-avatar'
import { timeAgo } from '@/lib/utils'

type SidebarUser = {
  name?: string | null
  email?: string | null
  avatarUrl?: string | null
} | null

function SidebarBody({
  user,
  sessions,
  pathname,
  onSelectSession,
  onLinkNavigate,
  onOpenSearch,
  searchOpen,
  onSearchOpenChange,
  onClose,
  closeTitle,
}: {
  user: SidebarUser
  sessions: SessionSummary[]
  pathname: string
  onSelectSession: (id: string) => void
  onLinkNavigate: () => void
  onOpenSearch: () => void
  searchOpen: boolean
  onSearchOpenChange: (open: boolean) => void
  onClose: () => void
  closeTitle: string
}) {
  return (
    <>
      <SidebarHeader>
        <div className="flex items-center justify-between px-2 py-1">
          <UserAvatar user={user} size={6} />
          <div className="flex items-center gap-1 text-muted-foreground">
            <button
              onClick={onOpenSearch}
              className="rounded p-1.5 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Search sessions"
              title="Search sessions (Ctrl+K)"
            >
              <HugeiconsIcon icon={Search01Icon} size={15} />
            </button>
            <button
              onClick={onClose}
              className="rounded p-1.5 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label={closeTitle}
              title={closeTitle}
            >
              <HugeiconsIcon icon={PanelLeftIcon} size={14} />
            </button>
          </div>
        </div>
        <Link
          href="/"
          title="New session (Ctrl+Shift+O)"
          onClick={onLinkNavigate}
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
                  const isActive = pathname === `/sessions/${s.id}`
                  return (
                    <SidebarMenuItem key={s.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        className="h-auto py-2.5"
                        onClick={() => onSelectSession(s.id)}
                      >
                        <span className="flex w-full items-start gap-2">
                          {s.repoFullName ? (
                            s.status === 'RUNNING' ? (
                              <RunningRepoAvatar fullName={s.repoFullName} size={18} />
                            ) : (
                              <RepoAvatar fullName={s.repoFullName} size={18} />
                            )
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <span className="flex w-full items-center gap-1.5 text-sm leading-snug">
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
      <SearchDialog open={searchOpen} onOpenChange={onSearchOpenChange} />
    </>
  )
}

export function AppSidebar({
  user,
  recentSessions,
}: {
  user?: SidebarUser
  recentSessions: SessionSummary[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { open, setOpen, toggleSidebar } = useSidebar()
  const [peek, setPeek] = useState(false)
  const [peekShown, setPeekShown] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const [sessions, setSessions] = useState(recentSessions)
  const [searchOpen, setSearchOpen] = useState(false)

  useHotkeys('ctrl+k', (event) => {
    event.preventDefault()
    setSearchOpen((open) => !open)
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyO') {
        event.preventDefault()
        router.push('/')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

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
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [pathname])

  useEffect(() => {
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId: string; status: string }>).detail
      if (!detail) return
      setSessions((previous) =>
        previous.map((s) => (s.id === detail.sessionId ? { ...s, status: detail.status } : s)),
      )
    }
    window.addEventListener('forge:session-status', onStatus)
    return () => window.removeEventListener('forge:session-status', onStatus)
  }, [])

  function openPeek() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setPeek(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setPeekShown(true)))
  }

  function closePeek() {
    setPeekShown(false)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      setPeek(false)
      closeTimer.current = null
    }, 200)
  }

  // Clicking the panel icon while peeking pins the real sidebar open.
  function pinPeek() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setPeek(false)
    setPeekShown(false)
    setOpen(true)
  }

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    },
    [],
  )

  if (pathname === '/connect-github') return null

  const sidebarBody = (
    <SidebarBody
      user={user ?? null}
      sessions={sessions}
      pathname={pathname}
      onSelectSession={(id) => {
        closePeek()
        router.push(`/sessions/${id}`)
      }}
      onLinkNavigate={closePeek}
      onOpenSearch={() => setSearchOpen(true)}
      searchOpen={searchOpen}
      onSearchOpenChange={setSearchOpen}
      onClose={peek && !open ? pinPeek : toggleSidebar}
      closeTitle={peek && !open ? 'Keep sidebar open' : 'Close sidebar'}
    />
  )

  return (
    <>
      {!open && !peek ? (
        <div
          aria-hidden="true"
          className="fixed inset-y-0 left-0 z-30 hidden w-3 md:block"
          onMouseEnter={openPeek}
        />
      ) : null}
      {peek && !open ? (
        <div
          onMouseEnter={openPeek}
          onMouseLeave={closePeek}
          className={`fixed inset-y-0 left-0 z-40 hidden w-80 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[0_0.5rem_1.875rem_rgb(0_0_0/0.5)] transition-[transform,opacity] duration-200 ease-out md:flex ${peekShown ? 'translate-x-0 opacity-100' : '-translate-x-8 opacity-0'}`}
        >
          {sidebarBody}
        </div>
      ) : null}
      <Sidebar className="bg-sidebar text-sidebar-foreground">{sidebarBody}</Sidebar>
    </>
  )
}
