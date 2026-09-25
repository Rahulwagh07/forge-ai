'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { GoogleMark } from '@/components/workspace/home/google-mark'

export function LoginButton({
  label = 'Login',
  className = '',
}: {
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-0 bg-white p-8 text-brand-text-primary shadow-2xl ring-0">
          <DialogTitle className="font-[var(--font-marketing)] text-xl font-normal">
            Log in to Forge
          </DialogTitle>
          <button
            type="button"
            onClick={() => signIn('google')}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white"
          >
            <GoogleMark />
            Sign in with Google
          </button>
        </DialogContent>
      </Dialog>
    </>
  )
}
