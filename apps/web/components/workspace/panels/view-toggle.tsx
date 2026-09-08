'use client'

import { cn } from '@/lib/utils'

export type DiffView = 'unified' | 'split'

export function ViewToggle({
  view,
  onChange,
}: {
  view: DiffView
  onChange: (view: DiffView) => void
}) {
  return (
    <div
      role="group"
      aria-label="Diff view"
      className="flex shrink-0 items-center rounded-md p-0.5"
    >
      {(['unified', 'split'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={view === option}
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground hover:text-foreground',
            view === option && 'bg-secondary text-secondary-foreground',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
