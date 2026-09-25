import { Reveal } from './reveal'

const STEPS = [
  {
    n: '01',
    label: 'Brief',
    title: 'Describe the goal',
    desc: 'Type a plain-language objective. Forge turns it into a scoped task.',
  },
  {
    n: '02',
    label: 'Plan',
    title: 'Map the architecture',
    desc: 'It reads your repo, proposes a file-level plan, and flags risks before a line is written.',
  },
  {
    n: '03',
    label: 'Generate',
    title: 'Write the code',
    desc: 'Forge writes clean, typed code that looks like the rest of your repo.',
  },
  {
    n: '04',
    label: 'Verify',
    title: 'Test & self-heal',
    desc: 'It runs the suite, catches failures, and iterates until green. No hand-holding.',
  },
  {
    n: '05',
    label: 'Review',
    title: 'Open the PR',
    desc: 'A clean, reviewable pull request with a summary and changelog.',
  },
  {
    n: '06',
    label: 'Ship',
    title: 'You merge',
    desc: 'Nothing merges itself. Every merge needs your approval.',
  },
]

export function HowItWorks() {
  return (
    <section
      className="flex w-full flex-col items-center overflow-hidden bg-brand-background text-brand-text-primary"
      id="workflow"
      aria-labelledby="workflow-h"
    >
      <div className="w-full max-w-7xl px-10 py-[var(--brand-section-space)] max-md:px-8 max-md:py-16">
        <Reveal>
          <span className="text-sm text-brand-text-muted">How it works</span>
          <h2
            className="mt-3 max-w-[12em] font-[var(--font-marketing)] text-5xl font-normal leading-[1.05] tracking-tight max-md:text-4xl"
            id="workflow-h"
          >
            From task to working PR.
          </h2>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 border border-brand-border md:grid-cols-3">
          {STEPS.map((step, index) => {
            const divider =
              index === 0
                ? ''
                : index < 3
                  ? 'border-t border-brand-border md:border-l md:border-t-0'
                  : index === 3
                    ? 'border-t border-brand-border'
                    : 'border-t border-brand-border md:border-l'
            return (
              <Reveal key={step.n} delay={Math.min(index * 90, 270)} className={divider}>
                <div className="flex h-full flex-col bg-brand-background p-8">
                  <div className="flex items-start justify-between">
                    <span className="font-[var(--font-marketing)] text-5xl font-bold leading-none text-brand-text-primary/10">
                      {step.n}
                    </span>
                    <span className="text-sm font-medium text-brand-text-muted">{step.label}</span>
                  </div>
                  <div className="mt-8 text-[length:var(--brand-type-base)] font-semibold">
                    {step.title}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-brand-text-muted">{step.desc}</div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
