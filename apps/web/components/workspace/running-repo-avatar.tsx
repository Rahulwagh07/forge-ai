'use client'

import { repoColor } from '@/lib/repo'

export function RunningRepoAvatar({ fullName, size = 22 }: { fullName: string; size?: number }) {
  const color = repoColor(fullName)
  return (
    <span
      role="status"
      aria-label="Running"
      title="Running"
      className="flex shrink-0 items-center justify-center rounded-[6px]"
      style={{ width: size, height: size, backgroundColor: `${color}26`, color }}
    >
      <span aria-hidden="true" className="eq-loader" style={{ width: Math.round(size * 0.64) }} />
    </span>
  )
}
