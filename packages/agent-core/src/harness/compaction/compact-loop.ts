import type { AgentMessage } from '../provider.ts'
import {
  extractFileOps,
  findRecentStart,
  mergeFileOps,
  estimateMessagesTokens,
  type FileOps,
} from './context.ts'

export interface CompactionOptions {
  contextWindow?: number
  reserveTokens: number
  keepTokens: number
  summarize: (req: {
    tokensBefore: number
    messagesToSummarize: AgentMessage[]
    previousSummary?: string
    fileOps: FileOps
  }) => Promise<{ summary: string; readFiles: string[]; modifiedFiles: string[] }>
  // Returns true when the user typed /compact
  consumeForceCompact?: () => boolean
}

export interface LoopCompactionState {
  compactions: number
  previousSummary: string | undefined
  cumulativeFileOps: FileOps
  lastCompactionStep: number
}

export function createCompactionState(previousSummary?: string): LoopCompactionState {
  return {
    compactions: 0,
    previousSummary,
    cumulativeFileOps: { readFiles: [], modifiedFiles: [] },
    lastCompactionStep: 0,
  }
}

export async function tryCompactLoop(
  messages: AgentMessage[],
  compaction: CompactionOptions & { contextWindow: number },
  state: LoopCompactionState,
  currentStep: number,
  force: boolean,
  exactTokens?: number,
): Promise<boolean> {
  if (!force && currentStep - state.lastCompactionStep < 5) return false
  const tokensBefore = exactTokens ?? estimateMessagesTokens(messages)
  if (!force && tokensBefore <= compaction.contextWindow - compaction.reserveTokens) return false
  if (messages.length <= 4) return false
  const recentStart = findRecentStart(messages, compaction.keepTokens)
  if (recentStart <= 2 || recentStart >= messages.length - 1) return false
  const messagesToSummarize = messages.slice(2, recentStart)
  const recentMessages = messages.slice(recentStart)
  state.cumulativeFileOps = mergeFileOps(
    state.cumulativeFileOps,
    extractFileOps(messagesToSummarize),
  )
  //workaround for context lengths on free accounts
  let attempt = messagesToSummarize
  let compactionResult:
    { summary: string; readFiles: string[]; modifiedFiles: string[] } | undefined
  for (let remaining = 0; remaining < 3 && attempt.length > 0; remaining++) {
    try {
      compactionResult = await compaction.summarize({
        tokensBefore,
        messagesToSummarize: attempt,
        previousSummary: state.previousSummary,
        fileOps: state.cumulativeFileOps,
      })
      break
    } catch {
      attempt = attempt.slice(Math.ceil(attempt.length / 2))
    }
  }
  try {
    if (!compactionResult) throw new Error('summarization failed')
    state.previousSummary = compactionResult.summary
    state.cumulativeFileOps = {
      readFiles: compactionResult.readFiles,
      modifiedFiles: compactionResult.modifiedFiles,
    }
    const conversationHead = messages.slice(0, 2)
    messages.length = 0
    messages.push(
      ...conversationHead,
      {
        role: 'user',
        content: `Conversation summary so far:\n${compactionResult.summary}`,
      },
      ...recentMessages,
    )
    state.compactions += 1
    state.lastCompactionStep = currentStep
    return true
  } catch {
    // summarization must never kill the run; retry after cooldown
    state.lastCompactionStep = currentStep
    return false
  }
}
