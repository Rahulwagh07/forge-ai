'use client'

import { signOut } from 'next-auth/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Logout05Icon } from '@hugeicons/core-free-icons'

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectTo: '/' })}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      aria-label="Log out"
      title="Log out"
    >
      <HugeiconsIcon icon={Logout05Icon} size={15} />
    </button>
  )
}
