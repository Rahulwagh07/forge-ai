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
          isThinking: true,
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
