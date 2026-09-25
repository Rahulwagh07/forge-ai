import { Reveal } from './reveal'
import { StartBuildingButton } from './google-cta'

export function Hero() {
  return (
    <section
      className="flex flex-col items-center overflow-visible bg-brand-background text-brand-text-primary"
      id="demo"
      aria-labelledby="hero-h"
    >
      <div className="flex w-full max-w-7xl flex-col items-center justify-start px-10 pb-16 pt-24 max-md:px-8 max-md:pb-12 max-md:pt-16">
        <div className="flex w-full max-w-5xl flex-col items-center justify-center text-center">
          <Reveal delay={500}>
            <h1
              className="w-full font-[var(--font-marketing)] text-[2.5rem] font-[360] leading-[3.5rem] tracking-[-0.05rem] text-brand-text-primary max-md:text-4xl max-md:leading-tight"
              id="hero-h"
            >
              Your autonomous software engineer
              <br />
              that never stops building
            </h1>
          </Reveal>
          <Reveal delay={750}>
            <p className="mt-10 max-w-2xl text-[length:var(--brand-type-base)] leading-6 text-brand-text-muted">
              Describe a task. Forge reads your repo, shows its plan before writing a line, edits
              inside an isolated sandbox, runs the tests, and opens a PR for your review.
            </p>
          </Reveal>
          <Reveal delay={900}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
              <StartBuildingButton />
              <a
                href="/#workflow"
                className="inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm text-brand-text-primary transition-colors hover:bg-brand-surface"
              >
                See how it works
              </a>
            </div>
          </Reveal>
        </div>
      </div>
      <Reveal
        delay={1050}
        className="w-[min(75rem,calc(100%-5rem))] pb-4 max-md:w-[calc(100%-4rem)]"
      >
        <img className="block w-full rounded-xl" src="/landing/media/dashboard.png" alt="" />
      </Reveal>
    </section>
  )
}
