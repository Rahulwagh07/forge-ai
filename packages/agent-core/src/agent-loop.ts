import type { OutputChunk, SandboxHandle } from 'sandbox'
import type { AgentMessage, LLMProvider, ProviderResponse, ToolCall } from './harness/provider.ts'
import { isContextOverflowError } from './harness/provider.ts'
import { STEERING_MESSAGE_CHARS } from './constants.ts'
import { TOOL_DEFINITIONS, executeToolCall } from './harness/tools/index.ts'
import {
  estimateMessagesTokens,
  tryCompactLoop,
  createCompactionState,
  type CompactionOptions,
  type LoopCompactionState,
} from './harness/compaction/index.ts'
import { SYSTEM_PROMPT } from './harness/prompts/system.ts'

interface LoopStepEvent {
  stepNumber: number
  text?: string
  toolCalls?: ToolCall[]
  durationMs?: number
}

interface LoopToolResultEvent {
  stepNumber: number
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  output: string
  isError: boolean
  durationMs?: number
}

interface LoopToolOutputEvent extends OutputChunk {
  stepNumber: number
  toolCallId: string
  toolName: string
}

export interface LoopResult {
  steps: number
  stoppedBy: 'finish_session' | 'no_tool_calls' | 'max_steps' | 'timeout' | 'aborted'
  finalText?: string
  approxTokens?: number
  compactions?: number
}

interface ContextSnapshot {
  stepNumber: number
  approxTokens: number
}

export interface RunLoopOptions {
  provider: LLMProvider
  sandbox: SandboxHandle
  userPrompt: string
  systemPrompt?: string
  maxSteps: number
  maxWallClockMs?: number
  readOnly?: boolean
  onStep?: (event: LoopStepEvent) => void | Promise<void>
  onToken?: (event: { stepNumber: number; delta: string }) => void
  onToolOutput?: (event: LoopToolOutputEvent) => void
  onToolResult?: (event: LoopToolResultEvent) => void | Promise<void>
  getSteeringMessages?: () => string[] | Promise<string[]>
  initialMessages?: AgentMessage[]
  onContext?: (snapshot: ContextSnapshot) => void
  compaction?: CompactionOptions
  signal?: AbortSignal
}

async function executeStepTools(args: {
  sandbox: SandboxHandle
  calls: ToolCall[]
  stepNumber: number
  readOnly?: boolean
  messages: AgentMessage[]
  onToolOutput?: RunLoopOptions['onToolOutput']
  onToolResult?: RunLoopOptions['onToolResult']
  signal?: AbortSignal
}): Promise<{ finished: boolean; finalText?: string }> {
  let finished = false
  let finalText: string | undefined
  for (const call of args.calls) {
    if (args.signal?.aborted) break
    const toolStartedAt = Date.now()
    const outcome = await executeToolCall(args.sandbox, call, {
      readOnly: args.readOnly,
      signal: args.signal,
      onOutput: (chunk) => {
        args.onToolOutput?.({
          ...chunk,
          stepNumber: args.stepNumber,
          toolCallId: call.id,
          toolName: call.name,
        })
      },
    })
    args.messages.push({
      role: 'tool_result',
      toolCallId: call.id,
      content: outcome.output,
      isError: outcome.isError,
    })

    await args.onToolResult?.({
      stepNumber: args.stepNumber,
      toolCallId: call.id,
      toolName: call.name,
      input: call.input,
      output: outcome.output,
      isError: outcome.isError,
      durationMs: Date.now() - toolStartedAt,
    })

    if (call.name === 'finishSession') {
      finished = true
      finalText = outcome.output
    }
  }
  return { finished, finalText }
}

export async function runAgentLoop(opts: RunLoopOptions): Promise<LoopResult> {
  const { provider, sandbox, maxSteps } = opts
  const deadlineMs = opts.maxWallClockMs ? Date.now() + opts.maxWallClockMs : undefined

  const messages: AgentMessage[] = [
    ...(opts.initialMessages ?? [
      { role: 'system', content: opts.systemPrompt ?? SYSTEM_PROMPT },
      { role: 'user', content: opts.userPrompt },
    ]),
  ]

  let stoppedBy: LoopResult['stoppedBy'] = 'max_steps'
  let finalText: string | undefined
  let stepNumber = 0
  let lastPromptTokens: number | undefined
  const compactionState: LoopCompactionState = createCompactionState()
  // Window is a model fact: provider default wins, explicit option overrides.
  const compaction = opts.compaction && {
    contextWindow: provider.contextWindow,
    ...opts.compaction,
  }

  while (stepNumber < maxSteps) {
    if (opts.signal?.aborted) {
      stoppedBy = 'aborted'
      break
    }
    if (deadlineMs !== undefined && Date.now() > deadlineMs) {
      stoppedBy = 'timeout'
      break
    }
    if (opts.getSteeringMessages) {
      const steerings = await opts.getSteeringMessages()
      for (const msg of steerings) {
        const capped =
          msg.length > STEERING_MESSAGE_CHARS
            ? `${msg.slice(0, STEERING_MESSAGE_CHARS)}\n... [truncated]`
            : msg
        messages.push({ role: 'user', content: capped })
        await opts.onStep?.({ stepNumber: stepNumber + 1, text: `[steering] ${capped}` })
      }
    }

    stepNumber++

    opts.onContext?.({ stepNumber, approxTokens: estimateMessagesTokens(messages) })

    if (compaction?.consumeForceCompact?.()) {
      await tryCompactLoop(messages, compaction, compactionState, stepNumber, true)
    }

    const stepStartedAt = Date.now()
    const emitToken = (delta: string) => opts.onToken?.({ stepNumber, delta })
    let response: ProviderResponse
    try {
      response = await provider.runStep(messages, TOOL_DEFINITIONS, emitToken, opts.signal)
    } catch (err) {
      if (opts.signal?.aborted) {
        stoppedBy = 'aborted'
        break
      }
      // Overflow recovery: one retry, then fail
      const recovered =
        compaction &&
        isContextOverflowError(err) &&
        (await tryCompactLoop(messages, compaction, compactionState, stepNumber, true))
      if (!recovered) throw err
      response = await provider.runStep(messages, TOOL_DEFINITIONS, emitToken, opts.signal)
    }
    if (typeof response.usage?.inputTokens === 'number') {
      lastPromptTokens = response.usage.inputTokens
    }
    if (response.stopReason === 'max_tokens' && compaction) {
      // truncated output is unusable: compact and retry the step instead of stopping
      const recovered = await tryCompactLoop(
        messages,
        compaction,
        compactionState,
        stepNumber,
        true,
        lastPromptTokens,
      )
      if (recovered) continue
    }
    const durationMs = Date.now() - stepStartedAt
    messages.push({
      role: 'assistant',
      content: response.text ?? '',
      toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
    })

    if (response.stopReason !== 'tool_use' || response.toolCalls.length === 0) {
      stoppedBy = 'no_tool_calls'
      finalText = response.text
      await opts.onStep?.({ stepNumber, text: response.text, durationMs })
      break
    }

    await opts.onStep?.({
      stepNumber,
      text: response.text,
      toolCalls: response.toolCalls,
      durationMs,
    })

    const { finished, finalText: toolFinalText } = await executeStepTools({
      sandbox,
      calls: response.toolCalls,
      stepNumber,
      readOnly: opts.readOnly,
      messages,
      onToolOutput: opts.onToolOutput,
      onToolResult: opts.onToolResult,
      signal: opts.signal,
    })
    if (finished) {
      stoppedBy = 'finish_session'
      finalText = toolFinalText
    }
    if (opts.signal?.aborted) {
      stoppedBy = 'aborted'
      break
    }
    if (compaction) {
      await tryCompactLoop(
        messages,
        compaction,
        compactionState,
        stepNumber,
        false,
        lastPromptTokens,
      )
    }

    if (stoppedBy === 'finish_session') break
  }

  return {
    steps: stepNumber,
    stoppedBy,
    finalText,
    approxTokens: estimateMessagesTokens(messages),
    compactions: compactionState.compactions,
  }
}
