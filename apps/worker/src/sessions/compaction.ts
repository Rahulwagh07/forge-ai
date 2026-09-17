import { prisma } from '@repo/db'
import { env } from '../env.ts'
import {
  COMPACTION_PROMPT,
  mergeFileOps,
  serializeConversation,
  type FileOps,
} from '@repo/agent-core'
import type { AgentMessage, ProviderResponse } from '@repo/agent-core'
import type { OpenAIProvider } from '@repo/agent-core'
import { toJsonValue } from '../runtime/events.ts'
import { log } from '../runtime/log.ts'

const RESUMED_FILES_SHOWN = 20
const SUMMARIZER_PATHS_SHOWN = 200
const STORED_PATHS_KEPT = 1000

interface CompactionSettings {
  reserveTokens: number
  keepTokens: number
}

interface CompactionModelOverride {
  reserveTokens?: number
  keepTokens?: number
}

export function loadCompactionSettings(activeModel?: string): CompactionSettings | null {
  if (env.COMPACTION_ENABLED === 'false') return null
  const modelOverrides = parseModelOverrides(env.COMPACTION_MODEL_OVERRIDES_JSON)
  const modelOverride = activeModel ? modelOverrides[activeModel] : undefined
  return {
    reserveTokens: modelOverride?.reserveTokens ?? env.COMPACTION_RESERVE_TOKENS,
    keepTokens: modelOverride?.keepTokens ?? env.COMPACTION_KEEP_TOKENS,
  }
}

function parseModelOverrides(rawJson: string | undefined): Record<string, CompactionModelOverride> {
  if (!rawJson) return {}
  try {
    const parsed = JSON.parse(rawJson) as Record<string, CompactionModelOverride>
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export interface CheckpointSummary {
  summary: string
  firstKeptStepNumber: number
  readFiles: string[]
  modifiedFiles: string[]
}

export async function loadLatestCheckpoint(sessionId: string): Promise<CheckpointSummary | null> {
  const checkpointRow = await prisma.sessionStep.findFirst({
    where: { sessionId, type: 'CHECKPOINT' },
    orderBy: [{ stepNumber: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  })
  if (!checkpointRow) return null
  const content = checkpointRow.content as Partial<CheckpointSummary> & { summary?: unknown }
  if (typeof content.summary !== 'string' || !content.summary) return null
  return {
    summary: content.summary,
    firstKeptStepNumber:
      typeof content.firstKeptStepNumber === 'number' ? content.firstKeptStepNumber : 0,
    readFiles: parseStringArray(content.readFiles),
    modifiedFiles: parseStringArray(content.modifiedFiles),
  }
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((file) => typeof file === 'string') : []
}

export function summaryMessage(
  checkpoint: Pick<CheckpointSummary, 'summary' | 'readFiles' | 'modifiedFiles'>,
): AgentMessage {
  const fileSections = [
    formatPathList(checkpoint.readFiles, RESUMED_FILES_SHOWN, {
      tag: 'read-files',
      moreHint: ', see Relevant Files above',
    }),
    formatPathList(checkpoint.modifiedFiles, RESUMED_FILES_SHOWN, {
      tag: 'modified-files',
      moreHint: ', see Relevant Files above',
    }),
  ].filter((section) => section !== '')
  const filesContext = fileSections.length > 0 ? `\n${fileSections.join('\n')}` : ''
  return {
    role: 'user',
    content: `Conversation summary so far:\n${checkpoint.summary}${filesContext}`,
  }
}

function formatPathList(
  files: string[],
  shown: number,
  wrap?: { tag: string; moreHint?: string },
): string {
  if (files.length === 0) return ''
  const recent = files.slice(-shown)
  const omitted = files.length - recent.length
  const body =
    omitted > 0
      ? `${recent.join('\n')}\n... +${omitted} more${wrap?.moreHint ?? ''}`
      : recent.join('\n')
  return wrap ? `<${wrap.tag}>\n${body}\n</${wrap.tag}>` : body
}

export async function summarizeWithLLM(
  summarizerProvider: OpenAIProvider,
  messagesToSummarize: AgentMessage[],
  previousSummary: string | undefined,
  fileOps: FileOps,
): Promise<{
  summary: string
  readFiles: string[]
  modifiedFiles: string[]
  summaryUsage: ProviderResponse['usage']
}> {
  const conversation = serializeConversation(messagesToSummarize)
  const prompt =
    `${COMPACTION_PROMPT}\n` +
    (previousSummary ? `## Previous Summary\n${previousSummary}\n\n` : '') +
    formatFilesForSummary(fileOps) +
    `## Conversation To Summarize\n${conversation}`
  const summarizerResponse = await summarizerProvider.runStep(
    [{ role: 'user', content: prompt }],
    [],
  )
  const summary = (summarizerResponse.text ?? '').trim()
  if (!summary) throw new Error('[worker] compaction summarizer returned an empty response')
  return {
    summary,
    readFiles: fileOps.readFiles,
    modifiedFiles: fileOps.modifiedFiles,
    summaryUsage: summarizerResponse.usage,
  }
}

function formatFilesForSummary(fileOps: FileOps): string {
  if (fileOps.readFiles.length === 0 && fileOps.modifiedFiles.length === 0) return ''
  const lines = ['## Tracked Files']
  const read = formatPathList(fileOps.readFiles, SUMMARIZER_PATHS_SHOWN)
  const modified = formatPathList(fileOps.modifiedFiles, SUMMARIZER_PATHS_SHOWN)
  if (read) lines.push(`Read:\n${read}`)
  if (modified) lines.push(`Modified:\n${modified}`)
  return `${lines.join('\n\n')}\n\n`
}

function capStoredPaths(fileOps: FileOps): FileOps {
  return {
    readFiles: fileOps.readFiles.slice(-STORED_PATHS_KEPT),
    modifiedFiles: fileOps.modifiedFiles.slice(-STORED_PATHS_KEPT),
  }
}

export async function persistCheckpoint(args: {
  sessionId: string
  absoluteStepNumber: number
  tokensBefore: number
  summary: string
  fileOps: FileOps
  priorCumulative: FileOps
  summaryUsage?: ProviderResponse['usage']
}): Promise<CheckpointSummary> {
  const mergedFileOps = capStoredPaths(mergeFileOps(args.priorCumulative, args.fileOps))
  const checkpointData = {
    summary: args.summary,
    firstKeptStepNumber: args.absoluteStepNumber,
    readFiles: mergedFileOps.readFiles,
    modifiedFiles: mergedFileOps.modifiedFiles,
    summaryUsage: args.summaryUsage,
  }
  await prisma.sessionStep.create({
    data: {
      sessionId: args.sessionId,
      stepNumber: args.absoluteStepNumber,
      type: 'CHECKPOINT',
      content: toJsonValue(args.sessionId, checkpointData),
    },
  })
  log.info('compaction checkpoint', {
    sessionId: args.sessionId,
    stepNumber: args.absoluteStepNumber,
    tokensBefore: args.tokensBefore,
    summaryUsage: args.summaryUsage,
  })
  return checkpointData
}
