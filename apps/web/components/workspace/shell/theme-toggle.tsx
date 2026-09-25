'use client'

import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons'

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    let isDark = document.documentElement.classList.contains('dark')
    if (!document.cookie.includes('forge-theme=')) {
      if (window.localStorage.getItem('forge-theme') === 'dark') {
        isDark = true
        document.documentElement.classList.add('dark')
        document.cookie = 'forge-theme=dark; path=/; max-age=31536000; SameSite=Lax'
      }
      window.localStorage.removeItem('forge-theme')
    }
    setDark(isDark)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    document.cookie = `forge-theme=${next ? 'dark' : 'light'}; path=/; max-age=31536000; SameSite=Lax`
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
      title={dark ? 'Use light theme' : 'Use dark theme'}
    >
      <HugeiconsIcon icon={dark ? Sun03Icon : Moon02Icon} size={16} />
    </button>
  )
}
