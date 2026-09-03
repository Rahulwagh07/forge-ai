import { prisma } from 'db'
import type { SessionStep } from 'db'
import { ASK_SYSTEM_PROMPT, OpenAIProvider, SYSTEM_PROMPT, runAgentLoop } from 'agent-core'
import type { AgentMessage, LoopResult, ToolCall } from 'agent-core'
import type { SandboxHandle } from 'sandbox'
import type { ManagedSandbox } from './sandbox-manager.ts'
import { getDiffSnapshot } from './git.ts'
import { publishEvent, toJsonValue } from './events.ts'
import { log } from './log.ts'

export interface AgentLoopContext {
  sessionId: string
  prompt: string
  isAsk: boolean
  defaultBranch: string
  sandbox: SandboxHandle
  managedSandbox: ManagedSandbox
}

export interface AgentLoopOutcome {
  result: LoopResult
  commitRequested: boolean
}

export async function runAgentLoopForSession(ctx: AgentLoopContext): Promise<AgentLoopOutcome> {
  const { sessionId, isAsk, sandbox } = ctx

  const provider = new OpenAIProvider()
  const maxSteps = Number(process.env.SESSION_MAX_STEPS ?? 500)
  const wallClockTimeoutMs = Number(process.env.SESSION_WALL_CLOCK_MS ?? 8 * 60 * 60 * 1000)
  let stepCount = 0
  let commitRequested = false
  let diffBaseFetched = false

  const historySteps = await prisma.sessionStep.findMany({
    where: { sessionId },
    orderBy: [{ stepNumber: 'asc' }, { createdAt: 'asc' }],
  })
  const initialMessages =
    historySteps.length > 0
      ? await buildInitialMessages(ctx.prompt, isAsk, historySteps)
      : undefined

  const result = await runAgentLoop({
    provider,
    sandbox,
    userPrompt: ctx.prompt,
    systemPrompt: isAsk ? ASK_SYSTEM_PROMPT : undefined,
    readOnly: isAsk,
    initialMessages,
    maxSteps,
    maxWallClockMs: wallClockTimeoutMs,
    getSteeringMessages: async () => {
      const pending = await prisma.sessionStep.findMany({
        where: { sessionId, type: 'STEERING', consumedAt: null },
        orderBy: [{ stepNumber: 'asc' }, { createdAt: 'asc' }],
      })
      const delivered: string[] = []
      for (const s of pending) {
        const marked = await prisma.sessionStep.updateMany({
          where: { id: s.id, consumedAt: null },
          data: { consumedAt: new Date() },
        })
        if (marked.count === 0) continue
        const c = s.content as { message?: unknown }
        const message = typeof c.message === 'string' ? c.message : JSON.stringify(s.content)
        delivered.push(message)
        publishEvent(sessionId, { type: 'steering', message }).catch(() => {})
      }
      return delivered
    },
    onStep: async (event) => {
      stepCount++

      // bump lastActiveAt every step (idle window)
      await prisma.session.update({
        where: { id: sessionId },
        data: { lastActiveAt: new Date() },
      })

      // Store step in DB...cold resume depends on this history
      await prisma.sessionStep.create({
        data: {
          sessionId,
          stepNumber: stepCount,
          type: event.toolCalls ? 'TOOL_CALL' : 'THOUGHT',
          content: toJsonValue(sessionId, event),
        },
      })

      publishEvent(sessionId, {
        type: 'step',
        step: event,
        stepNumber: stepCount,
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
      await prisma.sessionStep.create({
        data: {
          sessionId,
          stepNumber: event.stepNumber,
          type: 'TOOL_RESULT',
          content: toJsonValue(sessionId, event),
        },
      })
      await publishEvent(sessionId, { type: 'tool_result', result: event })

      // full snapshot keeps the changes correct after edits
      if (['writeFile', 'runCommand', 'commitAndOpenPR'].includes(event.toolName)) {
        const diff = await getDiffSnapshot(sandbox, ctx.defaultBranch, !diffBaseFetched)
        diffBaseFetched = true
        if (diff) {
          const diffEvent = {
            type: 'diff',
            diff,
            stepNumber: event.stepNumber,
          }
          await prisma.sessionStep.create({
            data: {
              sessionId,
              stepNumber: event.stepNumber,
              type: 'DIFF',
              content: toJsonValue(sessionId, diffEvent),
            },
          })
          await publishEvent(sessionId, diffEvent)
        }
      }
    },
  })

  return { result, commitRequested }
}

export async function buildInitialMessages(
  prompt: string,
  isAsk: boolean,
  historySteps: SessionStep[],
): Promise<AgentMessage[]> {
  const systemPrompt = isAsk ? ASK_SYSTEM_PROMPT : SYSTEM_PROMPT
  const msgs: AgentMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ]

  for (const s of historySteps) {
    const c = s.content as Record<string, unknown>
    if (s.type === 'STEERING') {
      // only re-deliver steering that was never fed to the model live.
      if (!s.consumedAt) {
        msgs.push({
          role: 'user',
          content: typeof c.message === 'string' ? c.message : JSON.stringify(s.content),
        })
        // mark delivered now so a concurrent live delivery can't double-feed.
        await prisma.sessionStep
          .update({ where: { id: s.id }, data: { consumedAt: new Date() } })
          .catch(() => {})
      }
    } else if (s.type === 'THOUGHT') {
      msgs.push({
        role: 'assistant',
        content: typeof c.text === 'string' ? c.text : '',
      })
    } else if (s.type === 'TOOL_CALL') {
      if (Array.isArray(c.toolCalls))
        msgs.push({
          role: 'assistant',
          content: typeof c.text === 'string' ? c.text : '',
          toolCalls: c.toolCalls as ToolCall[],
        })
    } else if (s.type === 'TOOL_RESULT') {
      msgs.push({
        role: 'tool_result',
        toolCallId: typeof c.toolCallId === 'string' ? c.toolCallId : 'unknown',
        content:
          typeof c.output === 'string' ? c.output : typeof c.content === 'string' ? c.content : '',
        isError: Boolean(c.isError),
      })
    }
  }

  // drop a trailing TOOL_CALL that has no matching TOOL_RESULT
  const last = msgs[msgs.length - 1]
  if (last?.role === 'assistant' && last.toolCalls && last.toolCalls.length > 0) {
    msgs.pop()
  }
  return msgs
}
