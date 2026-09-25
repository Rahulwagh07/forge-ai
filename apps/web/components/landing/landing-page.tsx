import { LandingNav } from './landing-nav'
import { Hero } from './hero'
import { HowItWorks } from './how-it-works'
import { Control } from './control'
import { Examples } from './examples'
import { FinalCta } from './final-cta'
import { LandingFooter } from './landing-footer'

export function LandingPage() {
  return (
    <div
      className="landing-root min-h-svh bg-[var(--brand-background)] text-[var(--brand-text-primary)] [font-family:var(--font-marketing)]"
      id="top"
    >
      <LandingNav />
      <Hero />
      <HowItWorks />
      <Control />
      <Examples />
      <FinalCta />
      <LandingFooter />
    </div>
  )
}
