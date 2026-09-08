'use client'

import { useState } from 'react'

export function useCopyConfirmation(timeout = 1200): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  return [
    copied,
    (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), timeout)
        },
        () => {},
      )
    },
  ]
}
