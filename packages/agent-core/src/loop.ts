import type { SandboxHandle } from 'sandbox'
import type { AgentMessage, LLMProvider, ToolCall } from './provider.ts'
import { DEFAULT_MAX_STEPS } from './constants.ts'
import { TOOL_DEFINITIONS, executeToolCall } from './tools.ts'

export const SYSTEM_PROMPT = `You are an autonomous software engineering agent working inside a sandboxed Linux environment with a fresh clone of the target repository at /workspace/repo.

Rules:
- Work only inside /workspace/repo.
- Explore before you change: list files and read relevant code before editing.
- Prefer small, focused changes that satisfy the user's request. Match the repo's existing style and conventions.
- Verify your work: run the repo's own build/test commands when they exist.
- Never force-push, never touch git history, never push to the default branch.
- Commit with commitAndOpenPR when a meaningful chunk of work is complete; call finishSession when you have nothing left to do or are waiting on the user.`

export interface LoopStepEvent {
  stepNumber: number
  text?: string
  toolCalls?: ToolCall[]
}

export interface LoopResult {
  steps: number
  stoppedBy: 'finish_session' | 'no_tool_calls' | 'max_steps'
  finalText?: string
}

export interface RunLoopOptions {
  provider: LLMProvider
  sandbox: SandboxHandle
  userPrompt: string
  systemPrompt?: string
  maxSteps?: number
  onStep?: (event: LoopStepEvent) => void
}

export async function runAgentLoop(opts: RunLoopOptions): Promise<LoopResult> {
  const { provider, sandbox } = opts
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS

  const messages: AgentMessage[] = [
    { role: 'system', content: opts.systemPrompt ?? SYSTEM_PROMPT },
    { role: 'user', content: opts.userPrompt },
  ]

  let stoppedBy: LoopResult['stoppedBy'] = 'max_steps'
  let finalText: string | undefined
  let stepNumber = 0

  while (stepNumber < maxSteps) {
    stepNumber++

    const response = await provider.runStep(messages, TOOL_DEFINITIONS)
    messages.push({
      role: 'assistant',
      content: response.text ?? '',
      toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
    })

    // No tools requested: the model is either answering or done
    if (response.stopReason !== 'tool_use' || response.toolCalls.length === 0) {
      stoppedBy = 'no_tool_calls'
      finalText = response.text
      opts.onStep?.({ stepNumber, text: response.text })
      break
    }

    opts.onStep?.({
      stepNumber,
      text: response.text,
      toolCalls: response.toolCalls,
    })

    for (const call of response.toolCalls) {
      const outcome = await executeToolCall(sandbox, call)
      messages.push({
        role: 'tool_result',
        toolCallId: call.id,
        content: outcome.output,
        isError: outcome.isError,
      })

      // the agent explicitly paused
      if (call.name === 'finishSession') {
        stoppedBy = 'finish_session'
        finalText = outcome.output
      }
    }

    if (stoppedBy === 'finish_session') break
  }

  return { steps: stepNumber, stoppedBy, finalText }
}
