'use client'

import { Reveal } from './reveal'
import { LoginButton } from './login-modal'

export function FinalCta() {
  return (
    <section
      className="flex w-full flex-col items-center bg-brand-background text-brand-text-primary"
      aria-labelledby="cta-h"
    >
      <div className="flex w-full max-w-7xl flex-col items-center gap-10 px-10 py-[var(--brand-section-space)] text-center max-md:px-8 max-md:py-16">
        <Reveal>
          <h2
            className="max-w-[18em] font-[var(--font-marketing)] text-[2rem] font-normal leading-12 tracking-[-0.02em]"
            id="cta-h"
          >
            Connect a repo.
            <br />
            Hand Forge the task you keep postponing.
          </h2>
        </Reveal>
        <Reveal delay={90}>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <LoginButton
              label="Start building"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand-accent px-4 py-2 text-sm text-brand-accent-foreground transition-transform hover:-translate-y-px"
            />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
