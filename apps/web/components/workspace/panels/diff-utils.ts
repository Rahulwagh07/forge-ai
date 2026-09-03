import parseGitDiff from 'parse-diff'

export type DiffLine = {
  text: string
  kind: 'context' | 'addition' | 'deletion' | 'hunk'
  oldLine?: number
  newLine?: number
}

export type ParsedFileChange = {
  path: string
  kind: 'created' | 'modified'
  additions: number
  deletions: number
  lines: DiffLine[]
}

function hunkHeader(hunk: {
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
  return parseGitDiff(diff).map((file) => {
    const lines: DiffLine[] = []
    for (const hunk of file.chunks) {
      lines.push({ text: hunkHeader(hunk), kind: 'hunk' })
      for (const change of hunk.changes) {
        // Git's "no trailing newline" annotation — not a code line.
        if (change.content.startsWith('\\ No newline')) continue
        if (change.type === 'add') {
          lines.push({ text: change.content, kind: 'addition', newLine: change.ln })
        } else if (change.type === 'del') {
          lines.push({ text: change.content, kind: 'deletion', oldLine: change.ln })
        } else {
          lines.push({
            text: change.content,
            kind: 'context',
            oldLine: change.ln1,
            newLine: change.ln2,
          })
        }
      }
    }
    return {
      path: file.to ?? file.from ?? '',
      kind: file.new ? 'created' : 'modified',
      additions: file.additions,
      deletions: file.deletions,
      lines,
    }
  })
}
