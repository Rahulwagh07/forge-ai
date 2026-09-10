import type {
  ChatItem,
  PullRequestInfo,
  StoredStep,
  TerminalChunk,
  TerminalEntry,
} from '@/lib/types'

export function cleanPrTitle(title: string): string {
  return title.replace(/^Agent session:\s*/i, '').trim()
}

function truncate(text: unknown, max = 60): string {
  const value = String(text ?? '').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export function describeToolCall(item: ChatItem): string {
  const input = item.toolInput ?? {}
  switch (item.toolName) {
    case 'runCommand':
      return input.cmd ? `Running \`${truncate(input.cmd)}\`` : 'Running a command'
    case 'readFile':
      return input.path
        ? `Reading \`${truncate(input.path)}\` to understand the code`
        : 'Reading a file'
    case 'listDir':
      return input.path
        ? `Exploring \`${truncate(input.path)}\` to find relevant files`
        : 'Exploring the repository'
    case 'writeFile':
      return input.path ? `Writing \`${truncate(input.path)}\`` : 'Writing a file'
    case 'commitAndOpenPR':
      return 'Pushing the branch and opening a pull request'
    case 'finishSession':
      return 'Wrapping up — telling you what changed and what I need next'
    default:
      return item.toolName ? `Working: ${item.toolName}` : 'Working'
  }
}

export function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000)
  return seconds > 0 ? `${seconds}s` : `${durationMs}ms`
}

export function initialChatItems(
  steps: StoredStep[],
  prompt?: string,
  pr?: PullRequestInfo,
): ChatItem[] {
  const items: ChatItem[] = []
  if (prompt)
    items.push({
      id: 'init-prompt',
      role: 'user',
      kind: 'steering',
      text: prompt,
    })

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    if (!step) continue
    const content = step.content
    const id = `init-${index}`
    if (step.type === 'STEERING') {
      items.push({
        id,
        role: 'user',
        kind: 'steering',
        text: 'message' in content ? content.message : JSON.stringify(content),
        createdAt: step.createdAt,
      })
    } else if (step.type === 'THOUGHT') {
      items.push({
        id,
        role: 'assistant',
        kind: 'thought',
        text: 'text' in content ? (content.text ?? '') : '',
        durationMs: 'durationMs' in content ? content.durationMs : undefined,
        createdAt: step.createdAt,
      })
    } else if (step.type === 'TOOL_CALL') {
      const calls = 'toolCalls' in content ? content.toolCalls : undefined
      const call = calls?.[0]
      const text = 'text' in content ? content.text : undefined
      if (typeof text === 'string' && text.trim()) {
        items.push({
          id: `${id}-thought`,
          role: 'assistant',
          kind: 'thought',
          isThinking: false,
          text,
          durationMs: 'durationMs' in content ? content.durationMs : undefined,
          createdAt: step.createdAt,
        })
      }
      items.push({
        id,
        role: 'tool',
        kind: 'tool_call',
        toolCallId: call?.id,
        toolName: call?.name ?? '',
        toolInput: call?.input ?? {},
        text: typeof text === 'string' ? text : undefined,
        createdAt: step.createdAt,
      })
    } else if (step.type === 'TOOL_RESULT') {
      items.push({
        id,
        role: 'tool',
        kind: 'tool_result',
        toolCallId: 'toolCallId' in content ? content.toolCallId : undefined,
        toolName: 'toolName' in content ? content.toolName : undefined,
        toolInput: 'input' in content ? content.input : undefined,
        toolOutput:
          'output' in content
            ? (content.output ?? '')
            : 'content' in content
              ? (content.content ?? '')
              : '',
        isError: 'isError' in content ? Boolean(content.isError) : false,
        durationMs: 'durationMs' in content ? content.durationMs : undefined,
        createdAt: step.createdAt,
      })
    }
  }

  if (pr?.url)
    items.push({
      id: 'initial-pr',
      role: 'system',
      kind: 'pr_created',
      text: 'Pull request created',
      pr,
    })
  return items
}

export function withToolResults(items: ChatItem[]): ChatItem[] {
  const results = new Map<string, ChatItem>()
  for (const item of items) {
    if (item.kind === 'tool_result' && item.toolCallId) results.set(item.toolCallId, item)
  }

  return items
    .filter((item) => item.kind !== 'tool_result')
    .map((item) => {
      if (item.kind !== 'tool_call' || !item.toolCallId) return item
      const result = results.get(item.toolCallId)
      return result
        ? {
            ...item,
            toolOutput: result.toolOutput,
            isError: result.isError,
            durationMs: result.durationMs,
          }
        : item
    })
}

export function toTerminalEntries(items: ChatItem[], chunks: TerminalChunk[]): TerminalEntry[] {
  const liveOutput = new Map<string, string>()
  for (const chunk of chunks)
    liveOutput.set(chunk.toolCallId, `${liveOutput.get(chunk.toolCallId) ?? ''}${chunk.data}`)

  return items
    .filter((item) => item.kind === 'tool_call' && item.toolName === 'runCommand')
    .map((item) => ({
      id: item.toolCallId ?? item.id,
      cmd: String(item.toolInput?.cmd ?? ''),
      output: item.toolOutput ?? liveOutput.get(item.toolCallId ?? '') ?? '',
    }))
}
