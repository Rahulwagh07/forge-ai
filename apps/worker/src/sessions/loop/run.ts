import { prisma } from '@repo/db'
import type { SandboxHandle } from '@repo/sandbox'
import { ASK_SYSTEM_PROMPT, OpenCodeProvider, runAgentLoop } from '@repo/agent-core'
import type { AgentMessage, LLMProvider, RunLoopOptions } from '@repo/agent-core'
import { env } from '../../env.ts'
import { publishEvent } from '../../runtime/events.ts'
import { log } from '../../runtime/log.ts'
import {
  loadCompactionSettings,
  summarizeAndCheckpoint,
  type CompactionSettings,
  type CompactionTracker,
} from '../compaction.ts'
import type { AgentLoopContext, AgentLoopOutcome, SessionLoopState } from './types.ts'
import { buildInitialMessages, claimReplayedSteering, loadResumeHistory } from './resume.ts'
import { composeSystemPrompt, loadRepoMemory } from '../repo-memory.ts'
import { claimCompactRequests, drainSteeringMessages } from './steering.ts'
import { recordLoopStep, recordToolOutput, recordToolResult } from './tool-events.ts'
import { runIdleCompaction } from './idle-compact.ts'

interface SessionLoopSetup {
  sessionId: string
  prompt: string
  askMode: boolean
  provider: LLMProvider
  sandbox: SandboxHandle
  baseBranch: string
  authUrl: string
  signal: AbortSignal
  systemPrompt: string | undefined
  initialMessages: AgentMessage[] | undefined
  stepNumberOffset: number
  compactionSettings: CompactionSettings | null
  compactionTracker: CompactionTracker
  loopState: SessionLoopState
}

export async function runAgentLoopForSession(context: AgentLoopContext): Promise<AgentLoopOutcome> {
  const { sessionId, askMode, sandbox } = context
  const provider = createSessionProvider(sessionId)
  const { stepNumberOffset, historySteps, checkpoint } = await loadResumeHistory(sessionId)
  const repoMemory = await loadRepoMemory(sandbox)
  const systemPrompt = composeSystemPrompt(askMode ? ASK_SYSTEM_PROMPT : undefined, repoMemory)
  const initialMessages =
    historySteps.length > 0 || checkpoint
      ? buildInitialMessages(context.prompt, systemPrompt, historySteps, checkpoint)
      : undefined
  const compactRequestCount = await claimCompactRequests(sessionId)
  await claimReplayedSteering(sessionId, historySteps)
  const setup: SessionLoopSetup = {
    sessionId,
    prompt: context.prompt,
    askMode,
    provider,
    sandbox,
    baseBranch: context.baseBranch,
    authUrl: context.authUrl,
    signal: context.signal,
    systemPrompt,
    initialMessages,
    stepNumberOffset,
    compactionSettings: loadCompactionSettings(),
    compactionTracker: {
      previousSummary: checkpoint?.summary,
      cumulativeFileOps: {
        readFiles: checkpoint?.readFiles ?? [],
        modifiedFiles: checkpoint?.modifiedFiles ?? [],
      },
    },
    loopState: {
      commitRequested: false,
      hasFetchedDiffBase: false,
      latestStepNumber: 0,
      forceCompactionRequested: compactRequestCount > 0,
    },
  }

  if (setup.loopState.forceCompactionRequested && historySteps.length > 0 && initialMessages) {
    const pendingRealSteering = await prisma.sessionStep.count({
      where: { sessionId, type: 'STEERING', consumedAt: null },
    })
    if (pendingRealSteering === 0) {
      return await runIdleCompaction({ ...setup, initialMessages })
    }
  }

  const result = await runAgentLoop(buildLoopOptions(setup))

  log.info('agent loop usage', {
    sessionId,
    steps: result.steps,
    stoppedBy: result.stoppedBy,
    totalUsage: result.totalUsage,
    toolCallCounts: result.toolCallCounts,
    compactions: result.compactions,
  })

  return { result, commitRequested: setup.loopState.commitRequested }
}

function createSessionProvider(sessionId: string): OpenCodeProvider {
  return new OpenCodeProvider({
    sessionId,
    credentials: { OPENCODE_API_KEY: env.OPENCODE_API_KEY },
  })
}

function buildLoopOptions(setup: SessionLoopSetup): RunLoopOptions {
  const { sessionId, stepNumberOffset } = setup
  const loopOptions: RunLoopOptions = {
    provider: setup.provider,
    sandbox: setup.sandbox,
    userPrompt: setup.prompt,
    systemPrompt: setup.systemPrompt,
    readOnly: setup.askMode,
    initialMessages: setup.initialMessages,
    maxSteps: env.SESSION_MAX_STEPS,
    maxWallClockMs: env.SESSION_WALL_CLOCK_MS,
    maxInputTokens: env.SESSION_TOKEN_BUDGET_INPUT_TOKENS,
    signal: setup.signal,
    onContext: ({ stepNumber }) => {
      setup.loopState.latestStepNumber = stepNumber
    },
    getSteeringMessages: () =>
      drainSteeringMessages(sessionId, () => {
        setup.loopState.forceCompactionRequested = true
      }),
    onToken: (event) => {
      publishEvent(sessionId, {
        type: 'step_delta',
        stepNumber: stepNumberOffset + event.stepNumber,
        delta: event.delta,
      }).catch((err) => log.error('failed to publish step delta', { error: String(err) }))
    },
    onStep: (event) => recordLoopStep(sessionId, stepNumberOffset, event),
    onToolOutput: (event) => recordToolOutput(sessionId, event),
    onToolResult: (event) =>
      recordToolResult(
        {
          sessionId,
          stepNumberOffset,
          sandbox: setup.sandbox,
          baseBranch: setup.baseBranch,
          authUrl: setup.authUrl,
          loopState: setup.loopState,
        },
        event,
      ),
  }

  if (setup.compactionSettings) {
    loopOptions.compaction = {
      ...setup.compactionSettings,
      consumeForceCompact: () => {
        if (!setup.loopState.forceCompactionRequested) return false
        setup.loopState.forceCompactionRequested = false
        return true
      },
      summarize: (request) =>
        summarizeAndCheckpoint(sessionId, setup.provider, setup.compactionTracker, {
          ...request,
          absoluteStepNumber: stepNumberOffset + setup.loopState.latestStepNumber,
        }),
    }
  }

  return loopOptions
}
