import parseGitDiff from 'parse-diff'
import type { DiffFileMeta, DiffFileStatus, DiffTotals } from '@/lib/types'

const DIFF_FILE_STATUSES: DiffFileStatus[] = ['created', 'modified', 'deleted', 'renamed']

function normalizeDiffFileStatus(value: string): DiffFileStatus {
  return DIFF_FILE_STATUSES.includes(value as DiffFileStatus)
    ? (value as DiffFileStatus)
    : 'modified'
}

export function diffFileMetaFromRow(row: {
  path: string
  status: string
  previousPath: string | null
  additions: number
  deletions: number
  binary: boolean
  contentTooLarge: boolean
}): DiffFileMeta {
  return {
    path: row.path,
    status: normalizeDiffFileStatus(row.status),
    previousPath: row.previousPath ?? undefined,
    additions: row.additions,
    deletions: row.deletions,
    binary: row.binary,
    contentTooLarge: row.contentTooLarge,
  }
}

const NO_NEWLINE_MARKER = '\\ No newline'

interface DiffLine {
  kind: 'context' | 'addition' | 'deletion'
  text: string
  oldLine?: number
  newLine?: number
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

interface HunkSpan {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
}

function parseHunkHeader(header: string): HunkSpan | null {
  const match = header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
  if (!match) return null
  return {
    oldStart: Number(match[1]),
    oldLines: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newLines: match[4] === undefined ? 1 : Number(match[4]),
  }
}

export interface ParsedFileChange {
  path: string
  previousPath?: string
  status: DiffFileStatus
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

function buildHunkHeader(hunk: {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
}): string {
  const oldSpan = hunk.oldLines === 1 ? '' : `,${hunk.oldLines}`
  const newSpan = hunk.newLines === 1 ? '' : `,${hunk.newLines}`
  return `@@ -${hunk.oldStart}${oldSpan} +${hunk.newStart}${newSpan} @@`
}

export function parseDiff(diff: string): ParsedFileChange[] {
  return parseGitDiff(diff)
    .map((file) => {
      const hunks: DiffHunk[] = []
      for (const hunk of file.chunks) {
        const lines: DiffLine[] = []
        for (const change of hunk.changes) {
          if (change.content.startsWith(NO_NEWLINE_MARKER)) continue
          if (change.type === 'add') {
            lines.push({
              kind: 'addition',
              text: change.content.slice(1),
              newLine: change.ln,
            })
          } else if (change.type === 'del') {
            lines.push({
              kind: 'deletion',
              text: change.content.slice(1),
              oldLine: change.ln,
            })
          } else {
            const text = change.content.startsWith(' ') ? change.content.slice(1) : change.content
            lines.push({
              kind: 'context',
              text,
              oldLine: change.ln1,
              newLine: change.ln2,
            })
          }
        }
        hunks.push({ header: buildHunkHeader(hunk), lines })
      }
      const to = file.to ?? file.from ?? ''
      const path = to === '/dev/null' ? (file.from ?? '') : to
      const { status, previousPath } = detectFileStatus(file)
      return {
        path,
        previousPath,
        status,
        additions: file.additions,
        deletions: file.deletions,
        hunks,
      } satisfies ParsedFileChange
    })
    .filter((file) => file.path !== '')
}

function detectFileStatus(file: { new?: true; deleted?: true; from?: string; to?: string }): {
  status: DiffFileStatus
  previousPath?: string
} {
  if (file.new === true) return { status: 'created' }
  if (file.deleted === true) return { status: 'deleted' }
  const from = file.from
  const to = file.to
  if (
    from !== undefined &&
    to !== undefined &&
    from !== '' &&
    to !== '' &&
    from !== '/dev/null' &&
    to !== '/dev/null' &&
    from !== to
  ) {
    return { status: 'renamed', previousPath: from }
  }
  return { status: 'modified' }
}

export const MAX_VISIBLE_DIFF_LINES = 800

export const DIFF_STATUS_LABEL: Record<DiffFileStatus, string> = {
  created: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
}

function linePrefix(line: DiffLine): string {
  if (line.kind === 'addition') return '+'
  if (line.kind === 'deletion') return '-'
  return ' '
}

function buildHunkText(hunk: DiffHunk): string {
  return [hunk.header, ...hunk.lines.map((line) => `${linePrefix(line)}${line.text}`)].join('\n')
}

export function buildFileDiffText(file: ParsedFileChange): string {
  const from = file.status === 'created' ? '/dev/null' : `a/${file.previousPath ?? file.path}`
  const to = file.status === 'deleted' ? '/dev/null' : `b/${file.path}`
  return [`--- ${from}`, `+++ ${to}`, ...file.hunks.map((hunk) => buildHunkText(hunk))].join('\n')
}

export function hunkOnlyPatch(hunks: DiffHunk[]): string {
  return hunks.map(buildHunkText).join('\n')
}

export function splitFileLines(text: string): string[] {
  if (text === '') return []
  return text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n')
}

export function contextPatch(oldStart: number, newStart: number, lines: string[]): string {
  const body = lines.map((line) => ` ${line}`).join('\n')
  return `@@ -${oldStart},${lines.length} +${newStart},${lines.length} @@\n${body}`
}

export interface ContentGap {
  key: string
  beforeHunk: number
  oldStart: number
  newStart: number
  count: number
}

export function contentGaps(hunks: DiffHunk[], oldTotal?: number, newTotal?: number): ContentGap[] {
  const gaps: ContentGap[] = []
  let prevOldEnd = 1
  let prevNewEnd = 1
  hunks.forEach((hunk, index) => {
    const span = parseHunkHeader(hunk.header)
    if (!span) return
    if (span.oldStart > prevOldEnd) {
      gaps.push({
        key: `gap-${index}`,
        beforeHunk: index,
        oldStart: prevOldEnd,
        newStart: prevNewEnd,
        count: span.oldStart - prevOldEnd,
      })
    }
    prevOldEnd = span.oldStart + span.oldLines
    prevNewEnd = span.newStart + span.newLines
  })
  if (oldTotal !== undefined && newTotal !== undefined && prevOldEnd <= oldTotal) {
    gaps.push({
      key: `gap-${hunks.length}`,
      beforeHunk: hunks.length,
      oldStart: prevOldEnd,
      newStart: prevNewEnd,
      count: oldTotal - prevOldEnd + 1,
    })
  }
  return gaps
}

export function visibleHunks(hunks: DiffHunk[], showAll: boolean): DiffHunk[] {
  if (showAll) return hunks
  const result: DiffHunk[] = []
  let budget = MAX_VISIBLE_DIFF_LINES
  for (const hunk of hunks) {
    if (budget <= 0) break
    result.push(hunk)
    budget -= hunk.lines.length
  }
  return result
}

export function sumDiffTotals(files: DiffFileMeta[]): DiffTotals {
  return files.reduce(
    (totals, file) => ({
      files: totals.files + 1,
      additions: totals.additions + file.additions,
      deletions: totals.deletions + file.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  )
}

export function placeholderFileFromMeta(meta: DiffFileMeta): ParsedFileChange {
  return {
    path: meta.path,
    previousPath: meta.previousPath,
    status: meta.status,
    additions: meta.additions,
    deletions: meta.deletions,
    hunks: [],
  }
}
