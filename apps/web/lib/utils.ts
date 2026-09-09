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

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatFullDate(iso?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date}, ${time}`
}

export function splitPath(path: string): { name: string; dir: string } {
  const index = path.lastIndexOf('/')
  if (index < 0) return { name: path, dir: '' }
  return { name: path.slice(index + 1), dir: path.slice(0, index) }
}

export function isValidBranchName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) return false
  if (value.includes('..') || value.startsWith('/') || value.endsWith('/')) return false
  return /^[A-Za-z0-9._/-]+$/.test(value)
}
