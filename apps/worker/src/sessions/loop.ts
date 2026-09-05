import { prisma } from 'db'
import type { SessionStep } from 'db'
import {
  ASK_SYSTEM_PROMPT,
  OpenAIProvider,
  SYSTEM_PROMPT,
  runAgentLoop,
  truncateToolOutput,
} from 'agent-core'
import type { AgentMessage, FileOps, LoopResult, RunLoopOptions, ToolCall } from 'agent-core'
import type { SandboxHandle } from 'sandbox'
import { env } from '../env.ts'
import type { ManagedSandbox } from '../sandbox/manager.ts'
import { getDiffWithStats } from '../sandbox/git.ts'
import { publishEvent, toJsonValue } from '../runtime/events.ts'
import { log } from '../runtime/log.ts'
import {
  loadCompactionSettings,
  loadLatestCheckpoint,
  persistCheckpoint,
  summarizeWithLLM,
  summaryMessage,
  type CheckpointSummary,
} from './compaction.ts'

const STORED_TOOL_OUTPUT_CHARS = 20000
const RESUME_HISTORY_LIMIT = 200
const RESUME_TOOL_OUTPUT_CHARS = 8000

export interface AgentLoopContext {
  sessionId: string
  prompt: string
  isAsk: boolean
  defaultBranch: string
  sandbox: SandboxHandle
  managedSandbox: ManagedSandbox
  authUrl: string
}

export interface AgentLoopOutcome {
  result: LoopResult
  commitRequested: boolean
}

interface CompactionTracker {
  previousSummary: string | undefined
  cumulativeFileOps: FileOps
}

async function summarizeAndCheckpoint(
  sessionId: string,
  provider: OpenAIProvider,
  tracker: CompactionTracker,
  request: {
    absoluteStepNumber: number
    tokensBefore: number
    messagesToSummarize: AgentMessage[]
    previousSummary?: string
    fileOps: FileOps
  },
): Promise<{ summary: string; readFiles: string[]; modifiedFiles: string[] }> {
  const { summary, readFiles, modifiedFiles } = await summarizeWithLLM(
    provider,
    request.messagesToSummarize,
    request.previousSummary ?? tracker.previousSummary,
    request.fileOps,
  )
  const savedCheckpoint = await persistCheckpoint({
    sessionId,
    absoluteStepNumber: request.absoluteStepNumber,
    tokensBefore: request.tokensBefore,
    summary,
    fileOps: { readFiles, modifiedFiles },
    priorCumulative: tracker.cumulativeFileOps,
  })
  tracker.previousSummary = savedCheckpoint.summary
  tracker.cumulativeFileOps = {
    readFiles: savedCheckpoint.readFiles,
    modifiedFiles: savedCheckpoint.modifiedFiles,
  }
  publishEvent(sessionId, { type: 'compaction', stepNumber: request.absoluteStepNumber }).catch(
    () => {},
  )
  return {
    summary: savedCheckpoint.summary,
    readFiles: savedCheckpoint.readFiles,
    modifiedFiles: savedCheckpoint.modifiedFiles,
  }
}

export async function runAgentLoopForSession(ctx: AgentLoopContext): Promise<AgentLoopOutcome> {
  const { sessionId, isAsk, sandbox } = ctx

  const provider = new OpenAIProvider({
    credentials: {
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      OPENAI_BASE_URL: env.OPENAI_BASE_URL,
      OPENAI_MODEL: env.OPENAI_MODEL,
      OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
    },
  })
  const maxSteps = env.SESSION_MAX_STEPS
  const wallClockTimeoutMs = env.SESSION_WALL_CLOCK_MS
  let commitRequested = false
  let hasFetchedDiffBase = false

  const { stepNumberOffset, historySteps, checkpoint } = await loadResumeHistory(sessionId)
  const initialMessages =
    historySteps.length > 0 || checkpoint
      ? buildInitialMessages(ctx.prompt, isAsk, historySteps, checkpoint)
      : undefined
  await claimReplayedSteering(sessionId, historySteps)

  const compactionSettings = loadCompactionSettings()
  let latestStepNumber = 0
  const compactionTracker: CompactionTracker = {
    previousSummary: checkpoint?.summary,
    cumulativeFileOps: {
      readFiles: checkpoint?.readFiles ?? [],
      modifiedFiles: checkpoint?.modifiedFiles ?? [],
    },
  }
  let forceCompactRequested = false
  const consumeForceCompact = () => {
    if (!forceCompactRequested) return false
    forceCompactRequested = false
    return true
  }

  const loopOptions: RunLoopOptions = {
    provider,
    sandbox,
    userPrompt: ctx.prompt,
    systemPrompt: isAsk ? ASK_SYSTEM_PROMPT : undefined,
    readOnly: isAsk,
    initialMessages,
    maxSteps,
    maxWallClockMs: wallClockTimeoutMs,
    onContext: ({ stepNumber }) => {
      latestStepNumber = stepNumber
    },
    getSteeringMessages: async () => {
      const pendingSteering = await prisma.sessionStep.findMany({
        where: { sessionId, type: 'STEERING', consumedAt: null },
        orderBy: [{ stepNumber: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      })
      const deliveredMessages: string[] = []
      for (const step of pendingSteering) {
        const claim = await prisma.sessionStep.updateMany({
          where: { id: step.id, consumedAt: null },
          data: { consumedAt: new Date() },
        })
        if (claim.count === 0) continue
        const content = step.content as { message?: unknown }
        const message =
          typeof content.message === 'string' ? content.message : JSON.stringify(step.content)
        if (message.trim() === '/compact') {
          forceCompactRequested = true
          continue
        }
        deliveredMessages.push(message)
        publishEvent(sessionId, { type: 'steering', message }).catch((error) =>
          log.warn('failed to publish steering', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      }
      return deliveredMessages
    },
    onStep: async (event) => {
      // bump lastActiveAt every step (idle window)
      await prisma.session.update({
        where: { id: sessionId },
        data: { lastActiveAt: new Date() },
      })

      // Store step in DB...cold resume depends on this history
      await prisma.sessionStep.create({
        data: {
          sessionId,
          stepNumber: stepNumberOffset + event.stepNumber,
          type: event.toolCalls ? 'TOOL_CALL' : 'THOUGHT',
          content: toJsonValue(sessionId, event),
        },
      })

      publishEvent(sessionId, {
        type: 'step',
        step: event,
        stepNumber: stepNumberOffset + event.stepNumber,
      }).catch((err) => log.error('failed to publish step', { error: String(err) }))
    },
    onToolOutput: (event) => {
      publishEvent(sessionId, {
        type: 'terminal_output',
        output: event,
      }).catch((err) => log.error('failed to publish terminal output', { error: String(err) }))
    },
    onToolResult: async (event) => {
      if (event.toolName === 'commitAndOpenPR' && !event.isError) {
        commitRequested = true
      }
      const storedResult = {
        ...event,
        output: truncateToolOutput(event.output ?? '', STORED_TOOL_OUTPUT_CHARS),
      }
      await prisma.sessionStep.create({
        data: {
          sessionId,
          stepNumber: stepNumberOffset + event.stepNumber,
          type: 'TOOL_RESULT',
          content: toJsonValue(sessionId, storedResult),
        },
      })
      await publishEvent(sessionId, { type: 'tool_result', result: storedResult })
      if (event.toolName === 'finishSession' && !event.isError) {
        const reason = typeof event.input.reason === 'string' ? event.input.reason.trim() : ''
        if (reason) {
          const closing = { stepNumber: event.stepNumber, text: reason }
          await prisma.sessionStep.create({
            data: {
              sessionId,
              stepNumber: stepNumberOffset + event.stepNumber,
              type: 'THOUGHT',
              content: toJsonValue(sessionId, closing),
            },
          })
          await publishEvent(sessionId, {
            type: 'step',
            step: closing,
            stepNumber: stepNumberOffset + event.stepNumber,
          })
        }
      }

      if (['writeFile', 'runCommand', 'commitAndOpenPR'].includes(event.toolName)) {
        const { diff, truncated, stats } = await getDiffWithStats(
          sandbox,
          ctx.defaultBranch,
          !hasFetchedDiffBase,
          ctx.authUrl,
        )
        hasFetchedDiffBase = true
        if (diff) {
          const diffEvent = {
            type: 'diff',
            diff,
            ...stats,
            truncated,
            stepNumber: stepNumberOffset + event.stepNumber,
          }
          await prisma.sessionStep.create({
            data: {
              sessionId,
              stepNumber: stepNumberOffset + event.stepNumber,
              type: 'DIFF',
              content: toJsonValue(sessionId, diffEvent),
            },
          })
          await publishEvent(sessionId, diffEvent)
        }
      }
    },
  }

  if (compactionSettings) {
    loopOptions.compaction = {
      ...compactionSettings,
      consumeForceCompact,
      summarize: (request) =>
        summarizeAndCheckpoint(sessionId, provider, compactionTracker, {
          ...request,
          absoluteStepNumber: stepNumberOffset + latestStepNumber,
        }),
    }
  }

  const result = await runAgentLoop(loopOptions)

  return { result, commitRequested }
}

async function loadResumeHistory(sessionId: string): Promise<{
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

async function claimReplayedSteering(
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

function buildInitialMessages(
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
