'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { TerminalEntry } from '@/lib/types'
import { TERMINAL_SCROLLBACK } from '@/lib/constants'

export function TerminalPanel({ entries }: { entries: TerminalEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [stick, setStick] = useState(true)

  const visible = useMemo(() => capToLineBudget(entries, TERMINAL_SCROLLBACK), [entries])

  useEffect(() => {
    if (!stick) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visible, stick])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setStick(distanceFromBottom < 48)
  }

  function jumpToLatest() {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
    setStick(true)
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-terminal leading-terminal"
        style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}
      >
        {visible.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
            Waiting for sandbox activity...
          </div>
        ) : (
          visible.map((entry) => (
            <div key={entry.id} className="mb-3">
              <div className="text-terminal-dim">
                <span className="mr-1.5">❯</span>
                {entry.cmd}
              </div>
              {entry.output?.split('\n').map((line, i) => (
                <Line key={`${entry.id}-${i}`} text={line} />
              ))}
            </div>
          ))
        )}
      </div>

      {!stick && visible.length > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 right-3 rounded-full border border-border/60 bg-background/90 px-2.5 py-1 text-terminal-badge text-muted-foreground shadow-sm hover:text-foreground"
        >
          ↓ Jump to latest
        </button>
      )}
    </div>
  )
}

function Line({ text }: { text: string }) {
  if (text.startsWith('(pass)')) {
    return (
      <div className="whitespace-pre-wrap text-terminal">
        <span className="text-success">✓ pass</span>
        <Timing text={text.replace(/^\(pass\)/, '')} />
      </div>
    )
  }
  if (text.startsWith('(fail)')) {
    return (
      <div className="whitespace-pre-wrap text-terminal">
        <span className="text-danger">✗ fail</span>
        <Timing text={text.replace(/^\(fail\)/, '')} />
      </div>
    )
  }
  const summary = text.trim().match(/^(\d+)\s+(pass|fail)$/)
  if (summary) {
    const isZeroFail = summary[2] === 'fail' && summary[1] === '0'
    const cls =
      summary[2] === 'pass' ? 'text-success' : isZeroFail ? 'text-terminal-dim' : 'text-danger'
    return <div className={cls}>{text}</div>
  }
  return (
    <div className="whitespace-pre-wrap text-terminal">
      <Timing text={text} />
    </div>
  )
}

function Timing({ text }: { text: string }) {
  const parts = text.split(/(\[[\d.]+ms\])/g)
  return (
    <>
      {parts.map((part, i) =>
        /^\[[\d.]+ms\]$/.test(part) ? (
          <span key={i} className="text-terminal-faint">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

function capToLineBudget(entries: TerminalEntry[], maxLines: number): TerminalEntry[] {
  let total = 0
  let startIndex = entries.length
  for (let i = entries.length - 1; i >= 0; i--) {
    total += 2 + (entries[i]?.output?.split('\n').length ?? 0)
    startIndex = i
    if (total >= maxLines) break
  }
  return entries.slice(startIndex)
}
