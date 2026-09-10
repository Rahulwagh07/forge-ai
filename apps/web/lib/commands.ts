interface ChatCommand {
  name: string
  description: string
}

const CHAT_COMMANDS: ChatCommand[] = [
  { name: 'compact', description: 'Summarize context and keep working' },
]

export function matchCommands(query: string): ChatCommand[] {
  const q = query.toLowerCase()
  return CHAT_COMMANDS.filter((c) => c.name.startsWith(q))
}
