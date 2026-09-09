'use client'

import { repoColor, repoLetter } from '@/lib/repo'

export function RepoAvatar({ fullName, size = 22 }: { fullName: string; size?: number }) {
  const color = repoColor(fullName)
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-[6px] font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.55),
        backgroundColor: color,
        color: '#ffffff',
      }}
    >
      {repoLetter(fullName)}
    </span>
  )
}
