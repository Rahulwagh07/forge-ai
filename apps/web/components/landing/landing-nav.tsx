'use client'

import { useEffect, useState } from 'react'
import { LoginButton } from './login-modal'

const LINKS = [
  { label: 'How it works', href: '/#workflow' },
  { label: 'Control', href: '/#control' },
  { label: 'Examples', href: '/#examples' },
]

export function ForgeMark() {
  return (
    <span
      className="inline-flex size-5 items-center justify-center rounded bg-brand-text-primary font-[var(--font-marketing)] text-xs font-bold leading-none text-brand-background"
      aria-hidden="true"
    >
      F
    </span>
  )
}

export function LandingNav() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const desktop = window.matchMedia('(min-width: 1025px)')
    const close = () => setOpen(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    desktop.addEventListener('change', close)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      desktop.removeEventListener('change', close)
    }
  }, [open])

  const button =
    'inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm transition-transform hover:-translate-y-px'

  return (
    <nav
      className="sticky top-0 z-50 bg-brand-background/75 backdrop-blur-[10px]"
      aria-label="Primary"
    >
      <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-6 px-10 py-5 max-md:px-8">
        <div className="flex min-w-0 items-center gap-[6.75rem] max-lg:gap-8">
          <a
            className="flex shrink-0 items-center gap-2 text-brand-text-primary"
            href="#top"
            aria-label="Forge home"
          >
            <ForgeMark />
            <span className="font-[var(--font-marketing)] text-lg leading-none">Forge</span>
          </a>
          <div className="flex items-center gap-1 max-lg:hidden">
            {LINKS.map((link) => (
              <a
                key={link.href}
                className="px-3 py-2 text-[length:var(--brand-type-base)] text-brand-text-primary transition-colors hover:text-brand-text-muted"
                href={link.href}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <div className="max-lg:hidden">
          <LoginButton
            label="Login"
            className={`${button} bg-brand-accent text-brand-accent-foreground`}
          />
        </div>
        <button
          className={`${button} bg-transparent px-3 lg:hidden`}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? 'Close menu' : 'Open menu'}
          type="button"
        >
          <span className="relative flex size-4 items-center justify-center" aria-hidden="true">
            <span
              className={`absolute h-px w-4 bg-current transition-transform duration-300 ${
                open ? 'rotate-45' : '-translate-y-[3px]'
              }`}
            />
            <span
              className={`absolute h-px w-4 bg-current transition-transform duration-300 ${
                open ? '-rotate-45' : 'translate-y-[3px]'
              }`}
            />
          </span>
        </button>
      </div>
      {open && (
        <div
          className="absolute inset-x-0 top-full z-40 flex max-h-[calc(100svh-100%)] overflow-y-auto bg-brand-background px-8 py-6 lg:hidden"
          id="mobile-navigation"
        >
          <nav className="flex w-full flex-col" aria-label="Mobile">
            {LINKS.map((link) => (
              <a
                key={link.href}
                className="border-b border-brand-border py-4 text-xl text-brand-text-primary"
                href={link.href}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="mt-8" onClick={() => setOpen(false)}>
              <LoginButton
                label="Login"
                className={`${button} bg-brand-accent text-brand-accent-foreground`}
              />
            </div>
          </nav>
        </div>
      )}
    </nav>
  )
}
