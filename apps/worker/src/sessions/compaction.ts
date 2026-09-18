import { prisma } from '@repo/db'
import { env } from '../env.ts'
import {
  COMPACTION_PROMPT,
  mergeFileOps,
  serializeConversation,
  type FileOps,
} from '@repo/agent-core'
import type { AgentMessage, LLMProvider, ProviderResponse } from '@repo/agent-core'
import { publishEvent, toJsonValue } from '../runtime/events.ts'
import { log } from '../runtime/log.ts'

const RESUMED_FILES_SHOWN = 20
const SUMMARIZER_PATHS_SHOWN = 200
const STORED_PATHS_KEPT = 1000

export interface CompactionSettings {
  reserveTokens: number
  keepTokens: number
}

export interface CompactionTracker {
  previousSummary: string | undefined
  cumulativeFileOps: FileOps
}

export function loadCompactionSettings(): CompactionSettings | null {
  if (env.COMPACTION_ENABLED === 'false') return null
  return {
    reserveTokens: env.COMPACTION_RESERVE_TOKENS,
    keepTokens: env.COMPACTION_KEEP_TOKENS,
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

async function summarizeWithLLM(
  provider: LLMProvider,
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
  const summaryResponse = await provider.runStep([{ role: 'user', content: prompt }], [])
  const summary = (summaryResponse.text ?? '').trim()
  if (!summary) throw new Error('[worker] compaction summarizer returned an empty response')
  return {
    summary,
    readFiles: fileOps.readFiles,
    modifiedFiles: fileOps.modifiedFiles,
    summaryUsage: summaryResponse.usage,
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

async function persistCheckpoint(args: {
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

export async function summarizeAndCheckpoint(
  sessionId: string,
  provider: LLMProvider,
  tracker: CompactionTracker,
  request: {
    absoluteStepNumber: number
    tokensBefore: number
    messagesToSummarize: AgentMessage[]
    previousSummary?: string
    fileOps: FileOps
  },
): Promise<{
  summary: string
  readFiles: string[]
  modifiedFiles: string[]
  summaryUsage: ProviderResponse['usage']
}> {
  const { summary, readFiles, modifiedFiles, summaryUsage } = await summarizeWithLLM(
    provider,
    request.messagesToSummarize,
    request.previousSummary ?? tracker.previousSummary,
    request.fileOps,
  )
  const savedCheckpoint = await persistCheckpoint({
    sessionId,
    absoluteStepNumber: request.absoluteStepNumber,
    tokensBefore: request.tokensBefore,
    summary,
    fileOps: { readFiles, modifiedFiles },
    priorCumulative: tracker.cumulativeFileOps,
    summaryUsage,
  })
  tracker.previousSummary = savedCheckpoint.summary
  tracker.cumulativeFileOps = {
    readFiles: savedCheckpoint.readFiles,
    modifiedFiles: savedCheckpoint.modifiedFiles,
  }
  publishEvent(sessionId, { type: 'compaction', stepNumber: request.absoluteStepNumber }).catch(
    (error) =>
      log.warn('failed to publish compaction', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      }),
  )
  publishEvent(sessionId, {
    type: 'compaction_usage',
    stepNumber: request.absoluteStepNumber,
    summaryUsage,
  }).catch((error) =>
    log.warn('failed to publish compaction usage', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  return {
    summary: savedCheckpoint.summary,
    readFiles: savedCheckpoint.readFiles,
    modifiedFiles: savedCheckpoint.modifiedFiles,
    summaryUsage,
  }
}
