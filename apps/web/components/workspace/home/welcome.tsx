'use client'
import { useEffect, useState } from 'react'

const TAGLINES = [
  'Build something new with Forge',
  'Ask Forge questions about your code',
  'Tell Forge Agent to fix a bug',
]

export function Welcome({ userName }: { userName: string | null }) {
  const items = [userName ? `Welcome back, ${userName}` : 'Welcome back', ...TAGLINES]
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), 3200)
    return () => clearInterval(id)
  }, [items.length])

  return (
    <div className="animate-in fade-in mb-8 flex flex-col items-center text-center duration-1000">
      <div className="flex h-12 w-12 items-center justify-center">
        <img
          src="/logo.png"
          alt="Forge"
          width={48}
          height={48}
          className="h-12 w-12 rounded-2xl object-cover"
        />
      </div>
      <div className="relative mt-5 h-6 w-full">
        {items.map((item, i) => (
          <span
            key={item}
            className={`absolute inset-x-0 top-0 text-base font-medium tracking-tight transition-all duration-700 ease-out ${
              i === index
                ? 'translate-y-0 opacity-100 blur-none'
                : '-translate-y-1 opacity-0 blur-[2px]'
            } ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
