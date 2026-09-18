import type { OutputChunk, SandboxHandle } from '@repo/sandbox'
import { assertSafePath, blockedCommandReason } from '../guards.ts'
import type { ToolCall } from '../provider.ts'
import {
  MAX_COMMAND_TIMEOUT_MS,
  MAX_TOOL_OUTPUT_CHARS,
  READ_DEFAULT_MAX_BYTES,
  READ_DEFAULT_MAX_LINES,
  TOOL_OUTPUT_PREVIEW_CHARS,
  TOOL_OUTPUT_OVERFLOW_CHARS,
} from '../../constants.ts'

const REPO_ROOT = '/workspace/repo'
const TOOL_OUTPUT_DIRECTORY = `${REPO_ROOT}/.forge/tool-output`

interface ToolOutcome {
  output: string
  isError: boolean
}

interface ToolExecutionOptions {
  onOutput?: (chunk: OutputChunk) => void
  readOnly?: boolean
  signal?: AbortSignal
}

const WRITE_TOOLS = new Set(['writeFile', 'editFile', 'commitAndOpenPR'])

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
      const startLine = requirePositiveInt(call.input.offset)
      const maxLines = requirePositiveInt(call.input.limit)
      const fileContent = await sandbox.readFile(path)
      return success(formatFileRange(fileContent, path, startLine, maxLines))
    }

    case 'editFile': {
      const path = requireString(call.input.path)
      const oldString = typeof call.input.oldString === 'string' ? call.input.oldString : undefined
      const newString = typeof call.input.newString === 'string' ? call.input.newString : undefined
      if (!path || oldString === undefined || newString === undefined) {
        return badInput('editFile requires `path`, `oldString` and `newString`')
      }
      const blocked = assertSafePath(path)
      if (blocked) return badInput(blocked)
      return await applyStringReplacement(sandbox, path, oldString, newString)
    }

    case 'grep': {
      const pattern = requireString(call.input.pattern)
      if (!pattern) return badInput('grep requires `pattern`')
      const searchPath = requireString(call.input.path) ?? REPO_ROOT
      const blocked = assertSafePath(searchPath)
      if (blocked) return badInput(blocked)
      const searchResult = await sandbox.runCommand(
        `rg -n --no-heading --max-count 100 -- ${quoteShellArgument(pattern)} ${quoteShellArgument(searchPath)}`,
        { signal: options.signal },
      )
      if (searchResult.exitCode === 1 && !searchResult.stdout.trim()) {
        return success('no matches')
      }
      const combinedOutput = [searchResult.stdout, searchResult.stderr].filter(Boolean).join('\n')
      if (searchResult.exitCode !== 0) return badInput(combinedOutput || 'grep failed')
      return success(await saveOverflowOutput(sandbox, call.id, combinedOutput))
    }

    case 'find': {
      const pattern = requireString(call.input.pattern)
      if (!pattern) return badInput('find requires `pattern`')
      const searchPath = requireString(call.input.path) ?? REPO_ROOT
      const blocked = assertSafePath(searchPath)
      if (blocked) return badInput(blocked)
      const searchResult = await sandbox.runCommand(
        `find ${quoteShellArgument(searchPath)} -name ${quoteShellArgument(pattern)} | head -n 100`,
        { signal: options.signal },
      )
      if (searchResult.exitCode !== 0) {
        return badInput(searchResult.stderr || 'find failed')
      }
      const matchedPaths = searchResult.stdout.trim()
      if (!matchedPaths) return success('no matches')
      return success(await saveOverflowOutput(sandbox, call.id, matchedPaths))
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
        signal: options.signal,
      })
      const combinedOutput = [
        `exitCode: ${result.exitCode}`,
        result.stdout && `stdout:\n${result.stdout}`,
        result.stderr && `stderr:\n${result.stderr}`,
      ]
        .filter(Boolean)
        .join('\n')
      return success(await saveOverflowOutput(sandbox, call.id, combinedOutput))
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
    `git reset -q -- .forge/tool-output .forge-tool-output 2>/dev/null || true; git add -A -- . ':!.forge/PLAN.md' ':!.forge/TODO.md' ':!.forge/tool-output' ':!.forge-tool-output' && { git diff --cached --quiet || git commit -m '${quoted}'; }`,
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

function formatFileRange(
  fileContent: string,
  filePath: string,
  startLine?: number,
  maxLines?: number,
): string {
  const allLines = fileContent.split('\n')
  const rangeStart = startLine ? startLine - 1 : 0
  if (rangeStart >= allLines.length) {
    return `offset ${startLine} is beyond end of file (${allLines.length} lines total)`
  }
  const selectedLines =
    maxLines !== undefined
      ? allLines.slice(rangeStart, rangeStart + maxLines)
      : allLines.slice(rangeStart)
  const rangeEnd = rangeStart + selectedLines.length
  let rangedContent = selectedLines.join('\n')
  if (Buffer.byteLength(rangedContent) > READ_DEFAULT_MAX_BYTES) {
    const cappedLines: string[] = []
    let cappedBytes = 0
    for (const line of selectedLines) {
      const lineBytes = Buffer.byteLength(`${line}\n`)
      if (
        cappedLines.length >= READ_DEFAULT_MAX_LINES ||
        cappedBytes + lineBytes > READ_DEFAULT_MAX_BYTES
      )
        break
      cappedLines.push(line)
      cappedBytes += lineBytes
    }
    rangedContent = `${cappedLines.join('\n')}\n\n[Showing lines ${rangeStart + 1}-${rangeStart + cappedLines.length} of ${allLines.length}. Use offset=${rangeStart + cappedLines.length + 1} to continue.]`
    return rangedContent
  }
  if (rangeEnd < allLines.length) {
    return `${rangedContent}\n\n[${allLines.length - rangeEnd} more lines in ${filePath}. Use offset=${rangeEnd + 1} to continue.]`
  }
  return rangedContent
}

async function applyStringReplacement(
  sandbox: SandboxHandle,
  filePath: string,
  oldString: string,
  newString: string,
): Promise<ToolOutcome> {
  const fileContent = await sandbox.readFile(filePath)
  const firstIndex = fileContent.indexOf(oldString)
  if (firstIndex === -1) return badInput(`editFile: oldString not found in ${filePath}`)
  if (fileContent.indexOf(oldString, firstIndex + 1) !== -1) {
    return badInput(`editFile: oldString appears multiple times in ${filePath}, be more specific`)
  }
  const updatedContent = fileContent.replace(oldString, () => newString)
  await sandbox.writeFile(filePath, updatedContent)
  return success(
    `edited ${filePath}: replaced ${oldString.length} chars with ${newString.length} chars`,
  )
}

async function saveOverflowOutput(
  sandbox: SandboxHandle,
  toolCallId: string,
  fullOutput: string,
): Promise<string> {
  if (fullOutput.length <= TOOL_OUTPUT_OVERFLOW_CHARS) return truncateToolOutput(fullOutput)
  const safeToolCallId = encodeURIComponent(toolCallId || 'unknown')
  const overflowPath = `${TOOL_OUTPUT_DIRECTORY}/${safeToolCallId}.log`
  try {
    await sandbox.writeFile(overflowPath, fullOutput)
  } catch {
    return truncateToolOutput(fullOutput)
  }
  const preview = truncateToolOutput(fullOutput, TOOL_OUTPUT_PREVIEW_CHARS)
  return `${preview}\n\n[Full output (${fullOutput.length} chars) saved to ${overflowPath}. Read it with readFile offset/limit instead of guessing.]`
}

function quoteShellArgument(argument: string): string {
  return `'${argument.replaceAll("'", `'\\''`)}'`
}

function requirePositiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
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
