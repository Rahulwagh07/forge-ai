import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m} minutes ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hours ago`
  return `${Math.floor(h / 24)} days ago`
}
