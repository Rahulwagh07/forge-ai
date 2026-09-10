'use client'
import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, GitBranchIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { Select } from '@base-ui/react/select'
import { Input } from '@/components/ui/input'

export function BranchSelect({
  value,
  defaultBranch,
  branches,
  disabled,
  onChange,
}: {
  value: string
  defaultBranch: string
  branches: string[]
  disabled?: boolean
  onChange: (branch: string) => void
}) {
  const [query, setQuery] = useState('')
  const options = Array.from(new Set([value, ...branches]))
  const visible = options.filter((name) => name.toLowerCase().includes(query.toLowerCase()))

  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        if (typeof next === 'string' && next.length > 0) onChange(next)
      }}
      onOpenChange={(open) => {
        if (!open) setQuery('')
      }}
      disabled={disabled}
    >
      <Select.Trigger
        className="flex min-w-0 max-w-[12rem] cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none disabled:cursor-default disabled:opacity-70"
        aria-label="Base branch"
      >
        <HugeiconsIcon icon={GitBranchIcon} size={13} className="shrink-0" />
        <span className="truncate">{value}</span>
        {disabled ? null : (
          <HugeiconsIcon icon={ArrowDown01Icon} size={12} className="shrink-0 opacity-70" />
        )}
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={8} align="start" alignItemWithTrigger={false}>
          <Select.Popup className="flex max-h-64 w-56 flex-col overflow-hidden rounded-lg bg-card p-1 text-sm text-card-foreground shadow-lg outline-none">
            {options.length > 3 ? (
              <div className="shrink-0 p-1" onKeyDown={(event) => event.stopPropagation()}>
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search branches"
                  className="h-8 border-0 text-sm"
                />
              </div>
            ) : null}
            <Select.List className="min-h-0 flex-1 overflow-auto outline-none">
              {visible.map((name) => (
                <Select.Item
                  key={name}
                  value={name}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none hover:bg-muted data-highlighted:bg-muted"
                >
                  <Select.ItemText className="min-w-0 flex-1 truncate">
                    {name}
                    {name === defaultBranch ? ' (default)' : ''}
                  </Select.ItemText>
                  <Select.ItemIndicator>
                    <HugeiconsIcon icon={Tick02Icon} size={14} className="shrink-0 text-primary" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
              {visible.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">No branches found</div>
              ) : null}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
