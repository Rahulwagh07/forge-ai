import type { AgentMessage, ToolCall } from '../provider.ts'

const SUMMARY_TOOL_CHARS = 2000
const PROTECTED_HEAD_MESSAGES = 2

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function estimateMessagesTokens(messages: AgentMessage[]): number {
  let chars = 0
  for (const message of messages) {
    if (message.role === 'assistant' && message.toolCalls)
      chars += JSON.stringify(message.toolCalls).length
    if ('content' in message) chars += message.content.length
  }
  return Math.ceil(chars / 4)
}

export interface FileOps {
  readFiles: string[]
  modifiedFiles: string[]
}

export function serializeConversation(
  messages: AgentMessage[],
  maxToolChars = SUMMARY_TOOL_CHARS,
): string {
  const lines: string[] = []
  for (const message of messages) {
    if (message.role === 'user') lines.push(`[User]: ${message.content}`)
    else if (message.role === 'assistant' && message.toolCalls?.length) {
      if (message.content) lines.push(`[Assistant]: ${message.content}`)
      lines.push(`[Assistant tool calls]: ${formatToolCallSummaries(message.toolCalls)}`)
    } else if (message.role === 'assistant') lines.push(`[Assistant]: ${message.content}`)
    else if (message.role === 'tool_result') {
      const toolOutput =
        message.content.length > maxToolChars
          ? `${message.content.slice(0, maxToolChars)}\n... [${message.content.length - maxToolChars} chars truncated]`
          : message.content
      lines.push(`[Tool result]: ${toolOutput}`)
    }
  }
  return lines.join('\n')
}

function formatToolCallSummaries(toolCalls: ToolCall[]): string {
  return toolCalls
    .map(
      (toolCall) =>
        `${toolCall.name}(${Object.entries(toolCall.input)
          .map(([key, value]) => `${key}=${JSON.stringify(value)?.slice(0, 200)}`)
          .join(', ')})`,
    )
    .join('; ')
}

export function findRecentStart(messages: AgentMessage[], keepTokens: number): number {
  let tokens = 0
  let recentStart = PROTECTED_HEAD_MESSAGES
  for (let scanIndex = messages.length - 1; scanIndex >= PROTECTED_HEAD_MESSAGES; scanIndex--) {
    const message = messages[scanIndex]
    if (!message) continue
    tokens += estimateTokens('content' in message ? message.content : '')
    if (message.role === 'assistant' && message.toolCalls)
      tokens += estimateTokens(JSON.stringify(message.toolCalls))
    if (tokens >= keepTokens) {
      recentStart = scanIndex
      break
    }
  }
  let firstKeptIndex = Math.max(PROTECTED_HEAD_MESSAGES, recentStart)
  while (firstKeptIndex < messages.length && messages[firstKeptIndex]?.role === 'tool_result')
    firstKeptIndex += 1
  return Math.min(firstKeptIndex, messages.length)
}

export function extractFileOps(messages: AgentMessage[]): FileOps {
  const readFiles = new Set<string>()
  const modifiedFiles = new Set<string>()
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls) continue
    for (const toolCall of message.toolCalls) {
      const filePath = typeof toolCall.input.path === 'string' ? toolCall.input.path : null
      if (!filePath) continue
      if (toolCall.name === 'readFile') readFiles.add(filePath)
      else if (toolCall.name === 'writeFile') modifiedFiles.add(filePath)
    }
  }
  return {
    readFiles: [...readFiles],
    modifiedFiles: [...modifiedFiles],
  }
}

export function mergeFileOps(current: FileOps, incoming: FileOps): FileOps {
  const union = (first: string[], second: string[]) => [...new Set([...first, ...second])]
  return {
    readFiles: union(current.readFiles, incoming.readFiles),
    modifiedFiles: union(current.modifiedFiles, incoming.modifiedFiles),
  }
}
