'use client'
import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUp02Icon } from '@hugeicons/core-free-icons'
import { matchCommands } from '@/lib/commands'
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
  const [dismissed, setDismissed] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const slashQuery = value.match(/^\/(\w*)$/)?.[1]
  const matches = slashQuery !== undefined && !dismissed ? matchCommands(slashQuery) : []
  const open = matches.length > 0
  const active = matches[Math.min(activeIdx, matches.length - 1)]

  function pick(name: string) {
    setValue(`/${name}`)
    setDismissed(true)
    setActiveIdx(0)
  }
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (open && active) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % matches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => (i - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(active.name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="relative rounded-2xl bg-chat-input p-3 shadow-sm">
      {open ? (
        <div className="absolute inset-x-3 bottom-full mb-1 overflow-hidden rounded-md bg-popover text-sm text-popover-foreground shadow-md outline-none">
          {matches.map((cmd, i) => (
            <button
              key={cmd.name}
              type="button"
              onClick={() => pick(cmd.name)}
              onMouseEnter={() => setActiveIdx(i)}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left outline-none ${cmd === active ? 'bg-muted' : ''}`}
            >
              <span className="font-mono font-medium">/{cmd.name}</span>
              <span className="truncate text-muted-foreground">{cmd.description}</span>
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setDismissed(false)
          setActiveIdx(0)
        }}
        placeholder={ph}
        disabled={status ? !canSteer : false}
        rows={3}
        onKeyDown={handleKeyDown}
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
