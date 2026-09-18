import type { SandboxHandle } from '@repo/sandbox'
import type { AgentMessage, ProviderResponse, ToolCall } from './harness/provider.ts'
import { isContextOverflowError } from './harness/provider.ts'
import {
  MAX_CONSECUTIVE_TOOL_ERROR_BATCHES,
  MAX_REPEATED_TOOL_BATCH,
  REPEATED_TOOL_BATCH_NUDGE,
  STEERING_MESSAGE_CHARS,
} from './constants.ts'
import { TOOL_DEFINITIONS, executeToolCall } from './harness/tools/index.ts'
import {
  estimateMessagesTokens,
  tryCompactLoop,
  createCompactionState,
  type LoopCompactionState,
} from './harness/compaction/index.ts'
import { SYSTEM_PROMPT } from './harness/prompts/system.ts'
import type { LoopResult, RunLoopOptions } from './types/agent-loop-types.ts'

export type {
  AfterToolCallResult,
  BeforeCompactArgs,
  BeforeToolCallResult,
  LoopContextSnapshot,
  LoopResult,
  LoopStepEvent,
  LoopToolOutputEvent,
  LoopToolResultEvent,
  RunLoopOptions,
} from './types/agent-loop-types.ts'

async function executeStepTools(args: {
  sandbox: SandboxHandle
  calls: ToolCall[]
  stepNumber: number
  readOnly?: boolean
  messages: AgentMessage[]
  onToolOutput?: RunLoopOptions['onToolOutput']
  onToolResult?: RunLoopOptions['onToolResult']
  signal?: AbortSignal
  beforeToolCall?: RunLoopOptions['beforeToolCall']
  afterToolCall?: RunLoopOptions['afterToolCall']
}): Promise<{ finished: boolean; finalText?: string; allToolCallsFailed: boolean }> {
  let finished = false
  let finalText: string | undefined
  let allToolCallsFailed = args.calls.length > 0
  let parallelCalls: ToolCall[] = []
  const markFinished = (outcome: { finished: boolean; finalText?: string }) => {
    if (outcome.finished) {
      finished = true
      finalText = outcome.finalText
    }
  }
  const guardedCall = async (
    call: ToolCall,
  ): Promise<{ output: string; isError: boolean; durationMs: number }> => {
    const guard = await args.beforeToolCall?.(call)
    const effectiveCall = guard?.input ? { ...call, input: guard.input } : call
    if (guard?.blocked) return { output: guard.blocked, isError: true, durationMs: 0 }
    const result = await runSingleToolCall(args, effectiveCall)
    const filtered = await args.afterToolCall?.({
      call: effectiveCall,
      output: result.output,
      isError: result.isError,
    })
    if (!filtered) return result
    return {
      ...result,
      output: filtered.output ?? result.output,
      isError: filtered.isError ?? result.isError,
    }
  }
  const runParallelCalls = async () => {
    const batchCalls = parallelCalls
    parallelCalls = []
    const batchOutcomes = await Promise.all(batchCalls.map((batchCall) => guardedCall(batchCall)))
    for (let batchIndex = 0; batchIndex < batchCalls.length; batchIndex++) {
      const batchCall = batchCalls[batchIndex]!
      const batchOutcome = batchOutcomes[batchIndex]!
      if (!batchOutcome.isError) allToolCallsFailed = false
      markFinished(await appendToolOutcome(args, batchCall, batchOutcome))
    }
  }
  for (const call of args.calls) {
    if (args.signal?.aborted) break
    if (CONCURRENCY_SAFE_TOOLS.has(call.name)) {
      parallelCalls.push(call)
      continue
    }
    await runParallelCalls()
    if (args.signal?.aborted) break
    const outcome = await guardedCall(call)
    if (!outcome.isError) allToolCallsFailed = false
    markFinished(await appendToolOutcome(args, call, outcome))
  }
  await runParallelCalls()
  return { finished, finalText, allToolCallsFailed }
}

const CONCURRENCY_SAFE_TOOLS = new Set(['readFile', 'listDir', 'grep', 'find'])

async function runSingleToolCall(
  args: {
    sandbox: SandboxHandle
    stepNumber: number
    readOnly?: boolean
    signal?: AbortSignal
    onToolOutput?: RunLoopOptions['onToolOutput']
  },
  call: ToolCall,
): Promise<{ output: string; isError: boolean; durationMs: number }> {
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
  return { ...outcome, durationMs: Date.now() - toolStartedAt }
}

async function appendToolOutcome(
  args: {
    messages: AgentMessage[]
    onToolResult?: RunLoopOptions['onToolResult']
    stepNumber: number
  },
  call: ToolCall,
  outcome: { output: string; isError: boolean; durationMs: number },
): Promise<{ finished: boolean; finalText?: string }> {
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
    durationMs: outcome.durationMs,
  })

  if (call.name === 'finishSession') {
    return { finished: true, finalText: outcome.output }
  }
  return { finished: false }
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
  let previousToolSignature: string | undefined
  let repeatedSignatureCount = 0
  let consecutiveErrorBatches = 0
  const totalUsage: NonNullable<ProviderResponse['usage']> = {}
  const toolCallCounts: Record<string, number> = {}
  const accumulateStepUsage = (stepUsage: ProviderResponse['usage']) => {
    if (typeof stepUsage?.inputTokens === 'number') {
      totalUsage.inputTokens = (totalUsage.inputTokens ?? 0) + stepUsage.inputTokens
    }
    if (typeof stepUsage?.outputTokens === 'number') {
      totalUsage.outputTokens = (totalUsage.outputTokens ?? 0) + stepUsage.outputTokens
    }
    if (typeof stepUsage?.cacheReadTokens === 'number') {
      totalUsage.cacheReadTokens = (totalUsage.cacheReadTokens ?? 0) + stepUsage.cacheReadTokens
    }
    if (typeof stepUsage?.cacheWriteTokens === 'number') {
      totalUsage.cacheWriteTokens = (totalUsage.cacheWriteTokens ?? 0) + stepUsage.cacheWriteTokens
    }
  }
  const compactionState: LoopCompactionState = createCompactionState()
  const compaction = opts.compaction && {
    contextWindow: provider.contextWindow,
    consumeForceCompact: () => false,
    ...opts.compaction,
  }
  const runCompaction = async (force: boolean, exactTokens?: number): Promise<boolean> => {
    if (opts.beforeCompact) {
      const handled = await opts.beforeCompact({
        messages,
        state: compactionState,
        stepNumber,
        force,
        exactTokens,
      })
      if (typeof handled === 'boolean') return handled
    }
    if (!compaction) return false
    return tryCompactLoop(messages, compaction, compactionState, stepNumber, force, exactTokens)
  }
  const forceCompaction = (exactTokens?: number) => runCompaction(true, exactTokens)
  const compactIfNeeded = (exactTokens?: number) => runCompaction(false, exactTokens)

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

    opts.onContext?.({ stepNumber })

    if (compaction?.consumeForceCompact()) {
      await forceCompaction()
    }

    await opts.transformContext?.(messages, { stepNumber })

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
      const recovered = isContextOverflowError(err) && (await forceCompaction())
      if (!recovered) throw err
      response = await provider.runStep(messages, TOOL_DEFINITIONS, emitToken, opts.signal)
    }
    if (typeof response.usage?.inputTokens === 'number') {
      lastPromptTokens = response.usage.inputTokens
    }
    accumulateStepUsage(response.usage)
    if (opts.maxInputTokens !== undefined && (totalUsage.inputTokens ?? 0) >= opts.maxInputTokens) {
      stoppedBy = 'token_budget'
      break
    }
    if (response.stopReason === 'max_tokens') {
      // truncated output is unusable: compact and retry the step instead of stopping
      const recovered = await forceCompaction(lastPromptTokens)
      if (recovered) continue
    }
    if (response.stopReason === 'max_tokens') {
      stoppedBy = 'max_tokens'
      break
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
      await opts.onStep?.({
        stepNumber,
        text: response.text,
        durationMs,
        stepUsage: response.usage,
      })
      break
    }

    await opts.onStep?.({
      stepNumber,
      text: response.text,
      toolCalls: response.toolCalls,
      durationMs,
      stepUsage: response.usage,
    })
    for (const toolCall of response.toolCalls) {
      toolCallCounts[toolCall.name] = (toolCallCounts[toolCall.name] ?? 0) + 1
    }

    const {
      finished,
      finalText: toolFinalText,
      allToolCallsFailed,
    } = await executeStepTools({
      sandbox,
      calls: response.toolCalls,
      stepNumber,
      readOnly: opts.readOnly,
      messages,
      onToolOutput: opts.onToolOutput,
      onToolResult: opts.onToolResult,
      signal: opts.signal,
      beforeToolCall: opts.beforeToolCall,
      afterToolCall: opts.afterToolCall,
    })
    if (finished) {
      stoppedBy = 'finish_session'
      finalText = toolFinalText
    }
    const batchSignature = JSON.stringify(
      response.toolCalls.map((toolCall) => [toolCall.name, toolCall.input]),
    )
    if (batchSignature === previousToolSignature) {
      repeatedSignatureCount += 1
    } else {
      previousToolSignature = batchSignature
      repeatedSignatureCount = 1
    }
    if (repeatedSignatureCount >= MAX_REPEATED_TOOL_BATCH) {
      messages.push({ role: 'user', content: REPEATED_TOOL_BATCH_NUDGE })
      repeatedSignatureCount = 0
    }
    if (opts.signal?.aborted) {
      stoppedBy = 'aborted'
      break
    }
    consecutiveErrorBatches = allToolCallsFailed ? consecutiveErrorBatches + 1 : 0
    if (consecutiveErrorBatches >= MAX_CONSECUTIVE_TOOL_ERROR_BATCHES) {
      stoppedBy = 'consecutive_errors'
      break
    }
    await compactIfNeeded(lastPromptTokens)

    if (stoppedBy === 'finish_session') break
  }

  return {
    steps: stepNumber,
    stoppedBy,
    finalText,
    approxTokens: estimateMessagesTokens(messages),
    compactions: compactionState.compactions,
    totalUsage,
    toolCallCounts,
  }
}
