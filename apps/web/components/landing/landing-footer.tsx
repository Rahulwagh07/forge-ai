'use client'

import { LoginButton } from './login-modal'

export function LandingFooter() {
  const link = 'text-sm text-brand-text-muted transition-colors hover:text-brand-text-primary'
  return (
    <footer className="bg-brand-background text-brand-text-primary">
      <div className="mx-auto flex max-w-7xl flex-col px-10 py-12 max-md:px-8 max-md:py-10">
        <div className="grid grid-cols-[1.5fr_repeat(2,1fr)] gap-10 max-md:grid-cols-2 max-md:gap-12 max-sm:grid-cols-1">
          <div className="flex flex-col gap-2 text-sm">
            <a href="#top" className="text-lg font-semibold">
              Forge
            </a>
            <span className="max-w-[25em] leading-6 text-brand-text-muted">
              Autonomous software engineer
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="mb-2 text-xs tracking-[0.12em] text-brand-text-muted">Product</span>
            <a className={link} href="#demo">
              Live demo
            </a>
            <a className={link} href="#workflow">
              How it works
            </a>
            <a className={link} href="#control">
              Control
            </a>
          </div>
          <div className="flex flex-col gap-2">
            <span className="mb-2 text-xs tracking-[0.12em] text-brand-text-muted">App</span>
            <LoginButton label="Sign in" className={`${link} w-fit`} />
          </div>
        </div>
      </div>
    </footer>
  )
}
