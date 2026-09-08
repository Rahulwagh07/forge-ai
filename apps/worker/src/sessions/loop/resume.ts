import { prisma } from 'db'
import type { SessionStep } from 'db'
import { ASK_SYSTEM_PROMPT, SYSTEM_PROMPT, truncateToolOutput } from 'agent-core'
import type { AgentMessage, ToolCall } from 'agent-core'
import { log } from '../../runtime/log.ts'
import { loadLatestCheckpoint, summaryMessage, type CheckpointSummary } from '../compaction.ts'
import { RESUME_HISTORY_LIMIT, RESUME_TOOL_OUTPUT_CHARS } from './types.ts'

export async function loadResumeHistory(sessionId: string): Promise<{
  stepNumberOffset: number
  historySteps: SessionStep[]
  checkpoint: CheckpointSummary | null
}> {
  const [maxStepNumber, checkpoint] = await Promise.all([
    prisma.sessionStep.aggregate({ where: { sessionId }, _max: { stepNumber: true } }),
    loadLatestCheckpoint(sessionId).catch((error) => {
      log.warn('failed to load compaction checkpoint, resuming from full history', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }),
  ])
  const historySteps = await prisma.sessionStep.findMany({
    where: {
      sessionId,
      ...(checkpoint ? { stepNumber: { gte: checkpoint.firstKeptStepNumber } } : {}),
    },
    orderBy: [{ stepNumber: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: RESUME_HISTORY_LIMIT,
  })
  historySteps.reverse()
  return { stepNumberOffset: maxStepNumber._max.stepNumber ?? 0, historySteps, checkpoint }
}

export async function claimReplayedSteering(
  sessionId: string,
  historySteps: SessionStep[],
): Promise<void> {
  const replayedSteeringIds = historySteps
    .filter((step) => step.type === 'STEERING' && !step.consumedAt)
    .map((step) => step.id)
  if (replayedSteeringIds.length === 0) return
  await prisma.sessionStep
    .updateMany({
      where: { id: { in: replayedSteeringIds }, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    .catch((error) =>
      log.warn('failed to claim replayed steering', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
}

export function buildInitialMessages(
  prompt: string,
  isAsk: boolean,
  historySteps: SessionStep[],
  checkpoint: CheckpointSummary | null = null,
): AgentMessage[] {
  const systemPrompt = isAsk ? ASK_SYSTEM_PROMPT : SYSTEM_PROMPT
  const messages: AgentMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ]
  if (checkpoint) messages.push(summaryMessage(checkpoint))

  const firstReplayableIndex = historySteps.findIndex(
    (step) => step.type === 'STEERING' || step.type === 'THOUGHT' || step.type === 'TOOL_CALL',
  )
  const replayableSteps = firstReplayableIndex < 0 ? [] : historySteps.slice(firstReplayableIndex)

  for (const step of replayableSteps) {
    const content = step.content as Record<string, unknown>
    if (step.type === 'STEERING') {
      // only re-deliver steering that was never fed to the model live.
      if (!step.consumedAt) {
        messages.push({
          role: 'user',
          content:
            typeof content.message === 'string' ? content.message : JSON.stringify(step.content),
        })
      }
    } else if (step.type === 'THOUGHT') {
      messages.push({
        role: 'assistant',
        content: typeof content.text === 'string' ? content.text : '',
      })
    } else if (step.type === 'TOOL_CALL') {
      if (Array.isArray(content.toolCalls))
        messages.push({
          role: 'assistant',
          content: typeof content.text === 'string' ? content.text : '',
          toolCalls: content.toolCalls as ToolCall[],
        })
    } else if (step.type === 'TOOL_RESULT') {
      const rawOutput =
        typeof content.output === 'string'
          ? content.output
          : typeof content.content === 'string'
            ? content.content
            : ''
      messages.push({
        role: 'tool_result',
        toolCallId: typeof content.toolCallId === 'string' ? content.toolCallId : 'unknown',
        content: truncateToolOutput(rawOutput, RESUME_TOOL_OUTPUT_CHARS),
        isError: Boolean(content.isError),
      })
    }
  }

  // drop a trailing TOOL_CALL that has no matching TOOL_RESULT
  const lastMessage = messages[messages.length - 1]
  if (
    lastMessage?.role === 'assistant' &&
    lastMessage.toolCalls &&
    lastMessage.toolCalls.length > 0
  ) {
    messages.pop()
  }
  return messages
}
