import { prisma } from '@repo/db'
import type { SandboxHandle } from '@repo/sandbox'
import { truncateToolOutput } from '@repo/agent-core'
import type { LoopStepEvent, LoopToolOutputEvent, LoopToolResultEvent } from '@repo/agent-core'
import { STORED_TOOL_OUTPUT_CHARS } from '../../constants.ts'
import { publishEvent, toJsonValue } from '../../runtime/events.ts'
import { log } from '../../runtime/log.ts'
import type { SessionLoopState } from './types.ts'
import { syncDiffAfterTool } from './diff-sync.ts'

export async function recordLoopStep(
  sessionId: string,
  stepNumberOffset: number,
  event: LoopStepEvent,
): Promise<void> {
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
}

export function recordToolOutput(sessionId: string, event: LoopToolOutputEvent): void {
  publishEvent(sessionId, {
    type: 'terminal_output',
    output: event,
  }).catch((err) => log.error('failed to publish terminal output', { error: String(err) }))
}

export async function recordToolResult(
  args: {
    sessionId: string
    stepNumberOffset: number
    sandbox: SandboxHandle
    baseBranch: string
    authUrl: string
    loopState: SessionLoopState
  },
  event: LoopToolResultEvent,
): Promise<void> {
  const { sessionId, stepNumberOffset, sandbox } = args
  if (event.toolName === 'commitAndOpenPR' && !event.isError) {
    args.loopState.commitRequested = true
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

  if (['writeFile', 'editFile', 'runCommand', 'commitAndOpenPR'].includes(event.toolName)) {
    await syncDiffAfterTool(
      sandbox,
      sessionId,
      args.baseBranch,
      !args.loopState.hasFetchedDiffBase,
      args.authUrl,
    )
    args.loopState.hasFetchedDiffBase = true
  }
}
