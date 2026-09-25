'use client'

import { LoginButton } from './login-modal'

export function StartBuildingButton({ label = 'Start building' }: { label?: string }) {
  return (
    <LoginButton
      label={label}
      className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand-accent px-4 py-2 text-sm text-brand-accent-foreground transition-transform hover:-translate-y-px"
    />
  )
}
