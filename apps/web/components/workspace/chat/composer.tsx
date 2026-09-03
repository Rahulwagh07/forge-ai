'use client'
import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUp02Icon } from '@hugeicons/core-free-icons'
import type { SessionStatus } from '@/lib/types'

export function Composer({
  status,
  onSend,
  placeholder,
  disabled: disabledProp,
  allowCompleted,
}: {
  status?: SessionStatus
  onSend: (msg: string) => Promise<void>
  placeholder?: string
  disabled?: boolean
  allowCompleted?: boolean
}) {
  const [value, setValue] = useState('')
  const canSteer = status
    ? status === 'RUNNING' ||
      status === 'AWAITING_INPUT' ||
      status === 'PAUSED' ||
      status === 'FAILED' ||
      (allowCompleted && status === 'DONE')
    : true
  const disabled = disabledProp ?? (!canSteer || !value.trim())
  const ph =
    placeholder ??
    (canSteer
      ? status === 'FAILED'
        ? 'Send a message to retry this session'
        : 'Ask a follow-up'
      : `Session is ${status?.toLowerCase()}`)

  async function handleSend() {
    const msg = value.trim()
    if (!msg || (!canSteer && status)) return
    if (disabledProp !== undefined && disabled) return
    setValue('')
    await onSend(msg)
  }

  return (
    <div className="rounded-2xl bg-chat-input p-3 shadow-sm">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={ph}
        disabled={status ? !canSteer : false}
        rows={3}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        className="w-full resize-none bg-transparent p-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={handleSend}
          disabled={disabled}
          className={`flex h-7 w-7 items-center justify-center rounded-md ${!disabled ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground'}`}
          aria-label="Send"
        >
          <HugeiconsIcon icon={ArrowUp02Icon} size={16} />
        </button>
      </div>
    </div>
  )
}
