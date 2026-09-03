'use client'

import { useEffect, useRef } from 'react'
import type { TerminalEntry } from '@/lib/types'
import { TERMINAL_SCROLLBACK } from '@/lib/constants'

export function TerminalPanel({ entries }: { entries: TerminalEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<import('xterm').Terminal | null>(null)
  const entriesRef = useRef(entries)
  const renderedSignatureRef = useRef('')

  entriesRef.current = entries

  useEffect(() => {
    let disposed = false
    let resizeObserver: ResizeObserver | undefined

    async function init() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('xterm'),
        import('xterm-addon-fit'),
      ])
      if (disposed || !containerRef.current) return

      const term = new Terminal({
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 13,
        theme: { background: '#1F1F1F', foreground: 'oklch(0.85 0 0)', cursor: 'oklch(0.85 0 0)' },
        convertEol: true,
        cursorBlink: false,
        scrollback: TERMINAL_SCROLLBACK,
        disableStdin: true,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(containerRef.current)
      fit.fit()
      termRef.current = term

      resizeObserver = new ResizeObserver(() => fit.fit())
      resizeObserver.observe(containerRef.current)
      renderEntries(term, entriesRef.current, renderedSignatureRef)
    }

    void init()
    return () => {
      disposed = true
      resizeObserver?.disconnect()
      termRef.current?.dispose()
      termRef.current = null
    }
  }, [])

  useEffect(() => {
    if (termRef.current) renderEntries(termRef.current, entries, renderedSignatureRef)
  }, [entries])

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-xl bg-[#1F1F1F] p-2">
      <div ref={containerRef} className="h-full w-full" />
      {entries.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
          Waiting for sandbox activity...
        </div>
      ) : null}
    </div>
  )
}

function renderEntries(
  term: import('xterm').Terminal,
  entries: TerminalEntry[],
  signatureRef: { current: string },
) {
  const signature = entries.map((entry) => `${entry.id}:${entry.output}`).join('\u0000')
  if (signature === signatureRef.current) return
  signatureRef.current = signature
  term.reset()

  for (const entry of entries) {
    term.writeln(`\x1b[90m$ \x1b[0m${entry.cmd}`)
    if (entry.output) {
      for (const line of entry.output.split('\n')) term.writeln(line)
    }
    term.writeln('')
  }
  term.scrollToBottom()
}
