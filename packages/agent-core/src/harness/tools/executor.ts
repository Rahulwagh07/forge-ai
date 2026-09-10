import type { OutputChunk, SandboxHandle } from 'sandbox'
import { assertSafePath, blockedCommandReason } from '../guards.ts'
import type { ToolCall } from '../provider.ts'
import { MAX_COMMAND_TIMEOUT_MS, MAX_TOOL_OUTPUT_CHARS } from '../../constants.ts'

interface ToolOutcome {
  output: string
  isError: boolean
}

interface ToolExecutionOptions {
  onOutput?: (chunk: OutputChunk) => void
  readOnly?: boolean
}

const WRITE_TOOLS = new Set(['writeFile', 'commitAndOpenPR'])

export async function executeToolCall(
  sandbox: SandboxHandle,
  call: ToolCall,
  options: ToolExecutionOptions = {},
): Promise<ToolOutcome> {
  try {
    return await invokeToolCall(sandbox, call, options)
  } catch (err) {
    return {
      output: truncateToolOutput(err instanceof Error ? err.message : String(err)),
      isError: true,
    }
  }
}

async function invokeToolCall(
  sandbox: SandboxHandle,
  call: ToolCall,
  options: ToolExecutionOptions,
): Promise<ToolOutcome> {
  if (options.readOnly && WRITE_TOOLS.has(call.name)) {
    return badInput(`blocked: ${call.name} is not available in read-only (ASK) mode`)
  }
  switch (call.name) {
    case 'readFile': {
      const path = requireString(call.input.path)
      if (!path) return badInput('readFile requires `path`')
      const blocked = assertSafePath(path)
      if (blocked) return badInput(blocked)
      return success(truncateToolOutput(await sandbox.readFile(path)))
    }

    case 'writeFile': {
      const path = requireString(call.input.path)
      const content = call.input.content
      if (!path || typeof content !== 'string') {
        return badInput('writeFile requires `path` and `content`')
      }
      const blocked = assertSafePath(path)
      if (blocked) return badInput(blocked)
      await sandbox.writeFile(path, content)
      return success(`wrote ${Buffer.byteLength(content)} bytes to ${path}`)
    }

    case 'listDir': {
      const path = requireString(call.input.path)
      if (!path) return badInput('listDir requires `path`')
      const blocked = assertSafePath(path)
      if (blocked) return badInput(blocked)
      const entries = await sandbox.listDir(path)
      return success(truncateToolOutput(entries.join('\n')))
    }

    case 'runCommand': {
      const cmd = requireString(call.input.cmd)
      if (!cmd) return badInput('runCommand requires `cmd`')
      const blocked = blockedCommandReason(cmd)
      if (blocked) return badInput(blocked)
      const requestedTimeoutMs =
        typeof call.input.timeoutMs === 'number' && Number.isFinite(call.input.timeoutMs)
          ? call.input.timeoutMs
          : undefined
      const timeoutMs = Math.min(
        Math.max(requestedTimeoutMs ?? MAX_COMMAND_TIMEOUT_MS, 0),
        MAX_COMMAND_TIMEOUT_MS,
      )
      const result = await sandbox.runCommand(cmd, {
        timeoutMs,
        onOutput: options.onOutput,
      })
      const parts = [
        `exitCode: ${result.exitCode}`,
        result.stdout && `stdout:\n${truncateToolOutput(result.stdout)}`,
        result.stderr && `stderr:\n${truncateToolOutput(result.stderr)}`,
      ].filter(Boolean)
      return success(parts.join('\n'))
    }

    case 'commitAndOpenPR':
      return commitAndOpenPR(sandbox, call)

    case 'finishSession': {
      const reason = typeof call.input.reason === 'string' ? call.input.reason : '(no reason given)'
      return success(`session paused: ${reason}`)
    }

    default:
      return badInput(`unknown tool: ${call.name}`)
  }
}

async function commitAndOpenPR(sandbox: SandboxHandle, call: ToolCall): Promise<ToolOutcome> {
  const commitMessage = requireString(call.input.commitMessage)
  if (!commitMessage) return badInput('commitAndOpenPR requires `commitMessage`')

  const quoted = commitMessage.replaceAll("'", `'\\''`)
  const result = await sandbox.runCommand(
    `git add -A && git diff --cached --quiet || git commit -m '${quoted}'`,
    {},
  )
  if (result.exitCode !== 0) {
    return {
      output: truncateToolOutput(`git commit failed:\n${result.stderr}`),
      isError: true,
    }
  }

  const branch = await sandbox.runCommand('git rev-parse --abbrev-ref HEAD')
  const branchName = branch.stdout.trim()
  return success(
    `committed "${commitMessage}" on branch ${branchName}. The platform pushes this branch and keeps the pull request up to date - no further git action needed.`,
  )
}

export function truncateToolOutput(text: string, max = MAX_TOOL_OUTPUT_CHARS): string {
  if (text.length <= max) return text
  const headSize = Math.floor(max / 4)
  const tailSize = max - headSize
  const omitted = text.length - headSize - tailSize
  return `${text.slice(0, headSize)}\n... [${omitted} chars truncated] ...\n${text.slice(-tailSize)}`
}

function requireString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function success(output: string): ToolOutcome {
  return { output, isError: false }
}

function badInput(message: string): ToolOutcome {
  return { output: message, isError: true }
}
