type Level = 'info' | 'warn' | 'error'

function emit(level: Level, msg: string, ctx?: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...ctx })
  ;(level === 'error' ? process.stderr : process.stdout).write(line + '\n')
}

export const log = {
  info: (msg: string, ctx?: Record<string, unknown>) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, ctx),
}
