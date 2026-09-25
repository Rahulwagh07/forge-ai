import { Reveal } from './reveal'

function BugIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2M3.4 3.4l1.6 1.6M11 11l1.6 1.6M12.6 3.4 11 5M5 11l-1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function FeatureIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 5.2v5.6M5.2 8h5.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function QuestionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.2 6.2c0-1 .8-1.9 1.8-1.9s1.8.8 1.8 1.7c0 1.4-1.8 1.6-1.8 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="12.4" r="1" fill="currentColor" />
    </svg>
  )
}

const EXAMPLES = [
  {
    kind: 'bug',
    label: 'Bug fix',
    Icon: BugIcon,
    req: 'Checkout test flakes in CI about 1 in 5 runs.',
    result: 'PR with the fix and 5 green runs logged.',
  },
  {
    kind: 'feature',
    label: 'Feature',
    Icon: FeatureIcon,
    req: 'Add cursor pagination to the admin orders table.',
    result: 'Pagination shipped behind the existing API shape.',
  },
  {
    kind: 'question',
    label: 'Question',
    Icon: QuestionIcon,
    req: 'Why are Stripe retries double-charging?',
    result: 'Root cause found and cited. No code changed.',
  },
] as const

export function Examples() {
  return (
    <section
      className="flex w-full flex-col items-center overflow-hidden bg-brand-background text-brand-text-primary"
      id="examples"
      aria-labelledby="examples-h"
    >
      <div className="flex w-full max-w-7xl flex-col gap-[var(--brand-section-gap)] px-10 py-[var(--brand-section-space)] max-md:gap-8 max-md:px-8 max-md:py-16">
        <Reveal>
          <div className="flex flex-col">
            <span className="text-sm text-brand-text-muted">Examples</span>
            <h2
              className="mt-3 max-w-[15em] font-[var(--font-marketing)] text-4xl font-normal leading-tight tracking-tight max-md:text-3xl"
              id="examples-h"
            >
              Tasks Forge handles well.
            </h2>
          </div>
        </Reveal>
        <div className="flex w-[calc(100%+3rem)] gap-10 overflow-x-auto pr-12 [scrollbar-width:none] max-md:w-[calc(100%+2rem)] max-md:pr-8">
          {EXAMPLES.map((example, index) => (
            <Reveal
              key={example.req}
              delay={Math.min(index * 90, 270)}
              className="min-w-[calc((100%-5rem)/3)] max-lg:min-w-[calc((100%-2.5rem)/2)] max-md:min-w-[82%]"
            >
              <article className="flex min-h-[25rem] h-full flex-col rounded border border-brand-surface bg-brand-background p-5">
                <div
                  className={`h-60 shrink-0 rounded bg-cover bg-center ${example.kind === 'bug' ? "bg-[url('/landing/media/example-1.png')]" : example.kind === 'feature' ? "bg-[url('/landing/media/example-2.png')]" : "bg-[url('/landing/media/example-3.png')]"}`}
                />
                <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-brand-border px-2 py-1 text-xs tracking-[0.08em] text-brand-text-muted">
                  <span className="text-brand-accent-strong">
                    <example.Icon />
                  </span>
                  {example.label}
                </span>
                <div className="mt-auto max-w-[16em] font-[var(--font-marketing)] text-2xl leading-8">
                  {example.req}
                </div>
                <div className="mt-5 text-sm leading-6 text-brand-text-muted">{example.result}</div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
