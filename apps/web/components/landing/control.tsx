import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon } from '@hugeicons/core-free-icons'
import { Reveal } from './reveal'

const POINTS = [
  'Many sessions on the same repo, at the same time.',
  'Start each session from main, develop, or any branch.',
  'Isolated runs. Nothing lands until you approve.',
  'Get the diff and every change streamed live.',
] as const

const SESSIONS = [
  {
    id: 'session-9f3k',
    task: 'cursor pagination',
    detail: 'cart/route.ts +38 −21',
    state: 'Tests green',
  },
  {
    id: 'session-7h2m',
    task: 'checkout flake fix',
    detail: '14 pass · 0 fail so far',
    state: 'Running',
  },
  {
    id: 'session-4q8z',
    task: 'stripe retry probe',
    detail: 'PR #482 ready to merge',
    state: 'Merge PR',
  },
] as const

export function Control() {
  return (
    <section
      className="flex w-full flex-col items-center overflow-hidden bg-brand-background text-brand-text-primary"
      id="control"
      aria-labelledby="control-h"
    >
      <div className="grid w-full max-w-7xl items-start gap-12 px-10 py-[var(--brand-section-space)] max-md:px-8 max-md:py-16 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <span className="text-sm text-brand-text-muted">Control</span>
          <h2
            className="mt-3 max-w-[12em] font-[var(--font-marketing)] text-4xl font-normal leading-tight tracking-tight max-md:text-3xl"
            id="control-h"
          >
            Run parallel sessions on the same repo.
          </h2>
          <ul className="mt-8 flex flex-col gap-10">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <HugeiconsIcon
                  icon={Tick02Icon}
                  size={16}
                  className="mt-1 shrink-0 text-brand-accent"
                />
                <span className="block text-[length:var(--brand-type-base)] leading-6">
                  {point}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={100}>
          <div className="flex aspect-[6/5] flex-col justify-center rounded bg-brand-border p-10 max-md:p-6">
            <div className="mx-auto flex min-h-[20rem] w-full max-w-sm flex-col justify-center rounded bg-brand-background p-6 max-md:p-5">
              <ul className="flex flex-col gap-7">
                {SESSIONS.map((session) => (
                  <li key={session.id} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {session.id} · {session.task}
                      </span>
                      <span className="mt-0.5 block truncate font-[var(--font-mono)] text-xs text-brand-text-muted">
                        {session.detail}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-brand-accent-wash px-3 py-1 text-xs text-brand-accent">
                      {session.state}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
