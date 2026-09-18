import { SYSTEM_PROMPT } from '@repo/agent-core'
import type { SandboxHandle } from '@repo/sandbox'

const REPO_ROOT = '/workspace/repo'
const REPO_MEMORY_MAX_CHARS = 8000

const CONTEXT_FILE_CANDIDATES = ['.forge/AGENTS.md', 'AGENTS.md', 'CLAUDE.md'] as const
const SYSTEM_OVERRIDE_PATH = `${REPO_ROOT}/.forge/SYSTEM.md`
const APPEND_SYSTEM_PATH = `${REPO_ROOT}/.forge/APPEND_SYSTEM.md`

interface RepoMemory {
  systemOverride?: string
  projectContext: string
}

export async function loadRepoMemory(sandbox: SandboxHandle): Promise<RepoMemory> {
  const [contextSections, systemOverride, appendSystemContent] = await Promise.all([
    Promise.all(
      CONTEXT_FILE_CANDIDATES.map(async (candidate) =>
        formatMemorySection(
          candidate,
          await readOptionalFile(sandbox, `${REPO_ROOT}/${candidate}`),
        ),
      ),
    ),
    readOptionalFile(sandbox, SYSTEM_OVERRIDE_PATH),
    readOptionalFile(sandbox, APPEND_SYSTEM_PATH),
  ])
  const sections = [
    ...contextSections,
    formatMemorySection('.forge/APPEND_SYSTEM.md', appendSystemContent),
  ]
  return {
    systemOverride: systemOverride ? capMemoryLength(systemOverride) : undefined,
    projectContext: capMemoryLength(
      sections.filter((section) => section !== undefined).join('\n\n'),
    ),
  }
}

export function composeSystemPrompt(
  basePrompt: string | undefined,
  repoMemory: RepoMemory,
): string | undefined {
  const effectiveBase = repoMemory.systemOverride ?? basePrompt ?? SYSTEM_PROMPT
  if (!repoMemory.projectContext) {
    return basePrompt === undefined && repoMemory.systemOverride === undefined
      ? undefined
      : effectiveBase
  }
  return `${effectiveBase}\n\n<project-context>\n${repoMemory.projectContext}\n</project-context>`
}

function formatMemorySection(label: string, content: string | undefined): string | undefined {
  if (!content) return undefined
  return `<context-file path="${label}">\n${content}\n</context-file>`
}

function capMemoryLength(projectContext: string): string {
  if (projectContext.length <= REPO_MEMORY_MAX_CHARS) return projectContext
  const omitted = projectContext.length - REPO_MEMORY_MAX_CHARS
  return `${projectContext.slice(0, REPO_MEMORY_MAX_CHARS)}\n... [${omitted} chars truncated]`
}

async function readOptionalFile(
  sandbox: SandboxHandle,
  absolutePath: string,
): Promise<string | undefined> {
  try {
    return await sandbox.readFile(absolutePath)
  } catch {
    return undefined
  }
}
