const PALETTE = [
  '#8250df',
  '#d361a0',
  '#c2620a',
  '#17806d',
  '#6e7681',
  '#0e8a9e',
  '#1a7f37',
  '#0969da',
  '#57606a',
  '#d1242f',
]

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function repoSlug(fullName: string): string {
  return fullName.split('/').pop() || fullName
}

export function repoLetter(fullName: string): string {
  const slug = repoSlug(fullName)
  return (slug.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase()
}

export function repoColor(fullName: string): string {
  return PALETTE[hashString(fullName.toLowerCase()) % PALETTE.length] ?? '#94a3b7'
}
