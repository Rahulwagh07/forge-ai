export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

export function getParentDirectory(p: string): string {
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}

export function getFileName(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? p : p.slice(i + 1)
}

export function getLastLines(text: string, lines = 10): string {
  const parts = text.trim().split('\n')
  return parts.slice(-lines).join('\n')
}
