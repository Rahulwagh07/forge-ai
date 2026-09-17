import type { SandboxHandle } from '@repo/sandbox'
import { shellQuote } from '@repo/sandbox'
import { fetchBaseAndStageUntracked, runInRepo } from './exec.ts'

type StepFileStatus = 'created' | 'modified' | 'deleted' | 'renamed'

interface SessionDiffFileRecord {
  path: string
  previousPath?: string
  status: StepFileStatus
  additions: number
  deletions: number
  binary: boolean
  patch: string
  oldContent: string
  newContent: string
  contentTooLarge: boolean
}

interface SessionDiffTotals {
  files: number
  additions: number
  deletions: number
}

interface SessionDiffSnapshot {
  files: SessionDiffFileRecord[]
  totals: SessionDiffTotals
}

const MAX_FILE_CONTENT_BYTES = 262144

interface FileContentResult {
  oldContent: string
  newContent: string
  contentTooLarge: boolean
}

export async function getSessionDiffSnapshot(
  sandbox: SandboxHandle,
  defaultBranch: string,
  fetchBase: boolean,
  authUrl: string,
): Promise<SessionDiffSnapshot> {
  const base = shellQuote(`origin/${defaultBranch}`)
  const result = await runInRepo(
    sandbox,
    `${fetchBaseAndStageUntracked(defaultBranch, fetchBase, authUrl)}echo '===FORGE-NAMESTATUS==='; git diff --name-status -z ${base} --; echo '===FORGE-NUMSTAT==='; git diff --numstat -z ${base} --; echo '===FORGE-UNIFIED==='; git diff --no-ext-diff --unified=3 ${base} --`,
    { timeoutMs: 30_000 },
  )
  if (result.exitCode !== 0) {
    return { files: [], totals: { files: 0, additions: 0, deletions: 0 } }
  }
  const nameSection = extractMarkerSection(
    result.stdout,
    '===FORGE-NAMESTATUS===',
    '===FORGE-NUMSTAT===',
  )
  const numSection = extractMarkerSection(
    result.stdout,
    '===FORGE-NUMSTAT===',
    '===FORGE-UNIFIED===',
  )
  const unifiedSection = extractMarkerSection(result.stdout, '===FORGE-UNIFIED===', '')

  const named = parseNameStatusZ(nameSection)
  const counted = parseNumstatZ(numSection)
  const blocks = splitUnifiedBlocks(unifiedSection)

  const byPath = new Map<string, CountedChange>()
  for (const entry of counted) {
    if (entry.path !== undefined) byPath.set(entry.path, entry)
    if (entry.renameTo !== undefined) {
      byPath.set(entry.renameTo, entry)
      if (entry.renameFrom !== undefined) byPath.set(entry.renameFrom, entry)
    }
  }

  const files: SessionDiffFileRecord[] = named.map((file, index) => {
    const positional = counted[index]
    const positionalMatch =
      positional !== undefined &&
      (positional.path === file.path ||
        positional.renameTo === file.path ||
        positional.path === undefined)
        ? positional
        : undefined
    const counts = positionalMatch ??
      byPath.get(file.path) ?? { additions: 0, deletions: 0, binary: false }
    return {
      path: file.path,
      previousPath: file.previousPath,
      status: file.status,
      additions: counts.additions,
      deletions: counts.deletions,
      binary: counts.binary,
      patch: blocks[index] ?? '',
      oldContent: '',
      newContent: '',
      contentTooLarge: false,
    }
  })

  const totals = files.reduce(
    (acc, file) => ({
      files: acc.files + 1,
      additions: acc.additions + file.additions,
      deletions: acc.deletions + file.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  )
  return { files, totals }
}

export async function getFileContents(
  sandbox: SandboxHandle,
  defaultBranch: string,
  files: SessionDiffFileRecord[],
): Promise<Map<string, FileContentResult>> {
  const results = new Map<string, FileContentResult>()
  const targets = files.filter((file) => !file.binary)
  if (targets.length === 0) return results
  const base = `origin/${defaultBranch}`
  const commands: string[] = []
  targets.forEach((file, index) => {
    if (file.status !== 'created') {
      const ref = shellQuote(`${base}:${file.previousPath ?? file.path}`)
      commands.push(
        `echo '===FORGE-CONTENT:${index}:old==='`,
        `git show ${ref} 2>/dev/null | head -c ${MAX_FILE_CONTENT_BYTES}; echo; echo "===FORGE-CONTENT-END:${index}:old:$(git cat-file -s ${ref} 2>/dev/null || echo missing)==="`,
      )
    }
    if (file.status !== 'deleted') {
      const quotedPath = shellQuote(file.path)
      commands.push(
        `echo '===FORGE-CONTENT:${index}:new==='`,
        `if [ -f ${quotedPath} ]; then head -c ${MAX_FILE_CONTENT_BYTES} -- ${quotedPath}; echo; echo "===FORGE-CONTENT-END:${index}:new:$(wc -c < ${quotedPath} | tr -d ' ')==="; else echo; echo '===FORGE-CONTENT-END:${index}:new:missing==='; fi`,
      )
    }
  })
  const result = await runInRepo(sandbox, commands.join('; '), { timeoutMs: 60_000 })
  if (result.exitCode !== 0) return results
  const pattern =
    /===FORGE-CONTENT:(\d+):(old|new)===\n([\s\S]*?)\n===FORGE-CONTENT-END:\1:\2:(missing|\d+)===\n?/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(result.stdout)) !== null) {
    const file = targets[Number(match[1])]
    const side = match[2]
    const content = match[3] ?? ''
    const size = match[4] ?? 'missing'
    if (!file || (side !== 'old' && side !== 'new')) continue
    const entry = results.get(file.path) ?? {
      oldContent: '',
      newContent: '',
      contentTooLarge: false,
    }
    const tooLarge = size !== 'missing' && Number(size) > MAX_FILE_CONTENT_BYTES
    if (tooLarge) {
      entry.contentTooLarge = true
      if (side === 'old') entry.oldContent = ''
      else entry.newContent = ''
    } else if (side === 'old') {
      entry.oldContent = content
    } else {
      entry.newContent = content
    }
    results.set(file.path, entry)
  }
  return results
}

export async function getChangeStats(
  sandbox: SandboxHandle,
  defaultBranch: string,
  fetchBase: boolean,
  authUrl: string,
): Promise<{ files: number; additions: number; deletions: number } | null> {
  const result = await runInRepo(
    sandbox,
    `${fetchBaseAndStageUntracked(defaultBranch, fetchBase, authUrl)}git diff --numstat ${shellQuote(`origin/${defaultBranch}`)} --`,
    { timeoutMs: 30_000 },
  )
  if (result.exitCode !== 0) return null

  return result.stdout.split('\n').reduce(
    (stats, line) => {
      const [additions, deletions] = line.split('\t')
      const added = Number(additions)
      const removed = Number(deletions)
      if (Number.isFinite(added) && Number.isFinite(removed)) {
        stats.files += 1
        stats.additions += added
        stats.deletions += removed
      }
      return stats
    },
    { files: 0, additions: 0, deletions: 0 },
  )
}

function extractMarkerSection(output: string, startMarker: string, endMarker: string): string {
  const start = output.indexOf(startMarker)
  if (start < 0) return ''
  let contentStart = start + startMarker.length
  if (output[contentStart] === '\n') contentStart += 1
  const end = endMarker ? output.indexOf(endMarker, contentStart) : -1
  return end < 0 ? output.slice(contentStart) : output.slice(contentStart, end)
}

function splitUnifiedBlocks(unified: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  for (const line of unified.split('\n')) {
    if (line.startsWith('diff --git ') && current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    }
    current.push(line)
  }
  if (current.length > 0) blocks.push(current.join('\n'))
  return blocks
}

function fileStatusFromLetter(letter: string): StepFileStatus {
  if (letter === 'A') return 'created'
  if (letter === 'D') return 'deleted'
  if (letter === 'R' || letter === 'C') return 'renamed'
  return 'modified'
}

interface NamedChange {
  status: StepFileStatus
  path: string
  previousPath?: string
}

function parseNameStatusZ(output: string): NamedChange[] {
  const tokens = output.split('\0')
  const files: NamedChange[] = []
  let index = 0
  while (index < tokens.length) {
    const statusToken = (tokens[index] ?? '').trim()
    index += 1
    if (!statusToken) continue
    const letter = statusToken[0] ?? ''
    if (letter === 'R' || letter === 'C') {
      const from = tokens[index] ?? ''
      const to = tokens[index + 1] ?? ''
      index += 2
      if (to) files.push({ status: fileStatusFromLetter(letter), path: to, previousPath: from })
    } else {
      const path = tokens[index] ?? ''
      index += 1
      if (path) files.push({ status: fileStatusFromLetter(letter), path })
    }
  }
  return files
}

interface CountedChange {
  additions: number
  deletions: number
  binary: boolean
  path?: string
  renameFrom?: string
  renameTo?: string
}

function parseNumstatZ(output: string): CountedChange[] {
  const tokens = output.split('\0')
  const files: CountedChange[] = []
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index] ?? ''
    index += 1
    const match = token.match(/^(\d+|-)\t(\d+|-)\t(.*)$/)
    if (!match) continue
    const additions = Number(match[1])
    const deletions = Number(match[2])
    const counts = {
      additions: Number.isFinite(additions) ? additions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0,
      binary: match[1] === '-' || match[2] === '-',
    }
    if (match[3] !== '') {
      files.push({ ...counts, path: match[3] })
    } else {
      const from = tokens[index] ?? ''
      const to = tokens[index + 1] ?? ''
      index += 2
      if (to) files.push({ ...counts, renameFrom: from, renameTo: to })
    }
  }
  return files
}
