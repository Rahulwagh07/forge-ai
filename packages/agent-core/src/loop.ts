import type { OutputChunk, SandboxHandle } from 'sandbox'
import type { AgentMessage, LLMProvider, ToolCall } from './provider.ts'
import { DEFAULT_MAX_STEPS } from './constants.ts'
import { TOOL_DEFINITIONS, executeToolCall } from './tools.ts'

export const SYSTEM_PROMPT = `You are an autonomous software engineering agent working inside a sandboxed Linux environment with a fresh clone of the target repository at /workspace/repo. The sandbox has node 22, bun 1.3 (at /home/agent/.bun/bin/bun), npm, yarn, pnpm, python3, git, ripgrep preinstalled.

Rules:
- Work only inside /workspace/repo.
- Explore before you change: list files and read relevant code before editing.
- Prefer small, focused changes that satisfy the user's request. Match the repo's existing style and conventions.
- Dependencies: if bun.lock exists use bun, else package-lock.json use npm, else yarn. Install with bun install / npm install yourself - never ask the user to install. If bun is not found, it is at /home/agent/.bun/bin/bun (PATH=$HOME/.bun/bin:$PATH) or install via curl -fsSL https://bun.sh/install | bash.
- Verify your work: run the repo's own build/test commands when they exist (bun run build, bun run check-types, npm test, npm run build). Never run bun run dev, npm run dev, yarn dev, pnpm dev - those are long-running dev servers that will block for 5 minutes.
- Never force-push, never touch git history, never push to the default branch.
- Commit with commitAndOpenPR when a meaningful chunk of work is complete; call finishSession when you have nothing left to do or are waiting on the user. Do not ask the user to install tools.`

export const ASK_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

Ask mode rules:
- Answer questions about the repository without changing files.
- Never call writeFile, commitAndOpenPR, or finishSession.
- Use readFile, listDir, and runCommand only when repository context is needed.`

export interface LoopStepEvent {
  stepNumber: number
  text?: string
  toolCalls?: ToolCall[]
  durationMs?: number
}

export interface LoopToolResultEvent {
  stepNumber: number
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  output: string
  isError: boolean
  durationMs?: number
}

export interface LoopToolOutputEvent extends OutputChunk {
  stepNumber: number
  toolCallId: string
  toolName: string
}

export interface LoopResult {
  steps: number
  stoppedBy: 'finish_session' | 'no_tool_calls' | 'max_steps' | 'timeout'
  finalText?: string
}

export interface RunLoopOptions {
  provider: LLMProvider
  sandbox: SandboxHandle
  userPrompt: string
  systemPrompt?: string
  maxSteps?: number
  maxWallClockMs?: number
  readOnly?: boolean
  onStep?: (event: LoopStepEvent) => void
  onToolOutput?: (event: LoopToolOutputEvent) => void
  onToolResult?: (event: LoopToolResultEvent) => void | Promise<void>
  // called between steps to get pending user follow-ups
  getSteeringMessages?: () => string[] | Promise<string[]>
  // Initial messages for cold resume
  initialMessages?: AgentMessage[]
}

export async function runAgentLoop(opts: RunLoopOptions): Promise<LoopResult> {
  const { provider, sandbox } = opts
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS
  const deadlineMs = opts.maxWallClockMs ? Date.now() + opts.maxWallClockMs : undefined

  const messages: AgentMessage[] = opts.initialMessages ?? [
    { role: 'system', content: opts.systemPrompt ?? SYSTEM_PROMPT },
    { role: 'user', content: opts.userPrompt },
  ]

  let stoppedBy: LoopResult['stoppedBy'] = 'max_steps'
  let finalText: string | undefined
  let stepNumber = 0

  while (stepNumber < maxSteps) {
    if (deadlineMs !== undefined && Date.now() > deadlineMs) {
      stoppedBy = 'timeout'
      break
    }
    if (opts.getSteeringMessages) {
      const steerings = await opts.getSteeringMessages()
      for (const msg of steerings) {
        messages.push({ role: 'user', content: msg })
        await opts.onStep?.({ stepNumber: stepNumber + 1, text: `[steering] ${msg}` })
      }
    }

    stepNumber++

    const stepStartedAt = Date.now()
    const response = await provider.runStep(messages, TOOL_DEFINITIONS)
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

    for (const call of response.toolCalls) {
      const toolStartedAt = Date.now()
      const outcome = await executeToolCall(sandbox, call, {
        readOnly: opts.readOnly,
        onOutput: (chunk) => {
          opts.onToolOutput?.({
            ...chunk,
            stepNumber,
            toolCallId: call.id,
            toolName: call.name,
          })
        },
      })
      messages.push({
        role: 'tool_result',
        toolCallId: call.id,
        content: outcome.output,
        isError: outcome.isError,
      })

      await opts.onToolResult?.({
        stepNumber,
        toolCallId: call.id,
        toolName: call.name,
        input: call.input,
        output: outcome.output,
        isError: outcome.isError,
        durationMs: Date.now() - toolStartedAt,
      })

      if (call.name === 'finishSession') {
        stoppedBy = 'finish_session'
        finalText = outcome.output
      }
    }

    if (stoppedBy === 'finish_session') break
  }

  return { steps: stepNumber, stoppedBy, finalText }
}
