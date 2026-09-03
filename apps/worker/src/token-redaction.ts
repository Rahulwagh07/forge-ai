const tokens = new Map<string, string>()

export function setSessionToken(sessionId: string, token: string): void {
  tokens.set(sessionId, token)
}

export function clearSessionToken(sessionId: string): void {
  tokens.delete(sessionId)
}

export function redactFor(sessionId: string, value: unknown): unknown {
  const activeToken = tokens.get(sessionId)
  if (!activeToken) return value
  return redactValue(value, activeToken)
}

function redactValue(value: unknown, activeToken: string): unknown {
  if (typeof value === 'string') {
    return value.includes(activeToken) ? value.split(activeToken).join('***') : value
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, activeToken))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redactValue(v, activeToken)]),
    )
  }
  return value
}
