'use client'

import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons'

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const isDark = window.localStorage.getItem('forge-theme') === 'dark'
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    window.localStorage.setItem('forge-theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
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
