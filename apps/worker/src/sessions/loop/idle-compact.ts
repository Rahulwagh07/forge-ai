import { createCompactionState, tryCompactLoop } from '@repo/agent-core'
import type { AgentMessage, LLMProvider, LoopResult, ProviderResponse } from '@repo/agent-core'
import { publishEvent } from '../../runtime/events.ts'
import { log } from '../../runtime/log.ts'
import {
  summarizeAndCheckpoint,
  type CompactionSettings,
  type CompactionTracker,
} from '../compaction.ts'

export async function runIdleCompaction(args: {
  sessionId: string
  provider: LLMProvider
  stepNumberOffset: number
  initialMessages: AgentMessage[]
  compactionSettings: CompactionSettings | null
  compactionTracker: CompactionTracker
}): Promise<{
  result: LoopResult
  commitRequested: boolean
}> {
  const { sessionId, stepNumberOffset } = args
  let idleUsage: ProviderResponse['usage'] = {}
  let idleCompactions = 0
  if (args.compactionSettings) {
    const idleState = createCompactionState(args.compactionTracker.previousSummary)
    const compacted = await tryCompactLoop(
      args.initialMessages,
      {
        contextWindow: args.provider.contextWindow,
        ...args.compactionSettings,
        summarize: async (request) => {
          const outcome = await summarizeAndCheckpoint(
            sessionId,
            args.provider,
            args.compactionTracker,
            {
              ...request,
              absoluteStepNumber: stepNumberOffset,
            },
          )
          idleUsage = outcome.summaryUsage ?? {}
          return outcome
        },
      },
      idleState,
      stepNumberOffset,
      true,
    )
    idleCompactions = compacted ? 1 : 0
  }
  log.info('idle compaction', {
    sessionId,
    compactions: idleCompactions,
    idleUsage,
  })
  if (idleCompactions === 0) {
    publishEvent(sessionId, {
      type: 'compaction',
      stepNumber: stepNumberOffset,
      compacted: false,
    }).catch((error) =>
      log.warn('failed to publish idle compaction', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
  const idleResult: LoopResult = {
    steps: 0,
    stoppedBy: 'finish_session',
    totalUsage: idleUsage,
    toolCallCounts: {},
    compactions: idleCompactions,
  }
  return { result: idleResult, commitRequested: false }
}
