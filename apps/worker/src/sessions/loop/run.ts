import { prisma } from 'db'
import { ASK_SYSTEM_PROMPT, OpenAIProvider, runAgentLoop, truncateToolOutput } from 'agent-core'
import type { AgentMessage, FileOps, RunLoopOptions } from 'agent-core'
import { env } from '../../env.ts'
import { publishEvent, toJsonValue } from '../../runtime/events.ts'
import { log } from '../../runtime/log.ts'
import { loadCompactionSettings, persistCheckpoint, summarizeWithLLM } from '../compaction.ts'
import {
  STORED_TOOL_OUTPUT_CHARS,
  type AgentLoopContext,
  type AgentLoopOutcome,
  type CompactionTracker,
} from './types.ts'
import { buildInitialMessages, claimReplayedSteering, loadResumeHistory } from './resume.ts'
import { syncDiffAfterTool } from './diff-sync.ts'

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
    sessionId,
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
    signal: ctx.signal,
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
    onToken: (event) => {
      publishEvent(sessionId, {
        type: 'step_delta',
        stepNumber: stepNumberOffset + event.stepNumber,
        delta: event.delta,
      }).catch((err) => log.error('failed to publish step delta', { error: String(err) }))
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
        await syncDiffAfterTool(
          sandbox,
          sessionId,
          ctx.defaultBranch,
          !hasFetchedDiffBase,
          ctx.authUrl,
        )
        hasFetchedDiffBase = true
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
