import type { ToolDefinition } from '../provider.ts'

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'readFile',
    description:
      'Read a text file in the repo. Supports offset/limit for large files. Paths are absolute inside the sandbox (repo root is /workspace/repo).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        offset: { type: 'number', description: '1-indexed start line, optional' },
        limit: { type: 'number', description: 'Max lines to return, optional' },
      },
      required: ['path'],
    },
  },
  {
    name: 'editFile',
    description:
      'Replace one exact string occurrence in an existing file. Fails when oldString is missing or appears multiple times.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        oldString: { type: 'string', description: 'Exact text to replace' },
        newString: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'oldString', 'newString'],
    },
  },
  {
    name: 'grep',
    description: 'Search file contents with ripgrep. Returns matching lines with line numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex or literal to search for' },
        path: {
          type: 'string',
          description: 'Absolute file or directory path, defaults to /workspace/repo',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'find',
    description: 'Find files by glob pattern. Returns matching absolute paths.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. **/*.ts' },
        path: {
          type: 'string',
          description: 'Absolute directory to search, defaults to /workspace/repo',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'writeFile',
    description:
      'Create or overwrite a file with the given contents. Parent directories are created automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        content: { type: 'string', description: 'Full file contents' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'listDir',
    description: 'List entries of a directory (files and folders, one per line).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute directory path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'runCommand',
    description:
      'Run a shell command inside the sandbox (working dir: repo root). Use for builds, tests, git inspection. Output is capped.',
    inputSchema: {
      type: 'object',
      properties: {
        cmd: { type: 'string', description: 'Shell command to run' },
        timeoutMs: {
          type: 'number',
          description: 'Optional kill-after duration in milliseconds',
        },
      },
      required: ['cmd'],
    },
  },
  {
    name: 'commitAndOpenPR',
    description:
      'Commit all current changes on the working branch. Call whenever a meaningful chunk of work is done — callable multiple times per session. The platform pushes the branch and keeps the pull request updated; you never push or open PRs yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        commitMessage: {
          type: 'string',
          description: 'Conventional commit message',
        },
      },
      required: ['commitMessage'],
    },
  },
  {
    name: 'finishSession',
    description:
      'Signal that you are done working or pausing for user input. Do not confuse with committing: finish only when nothing else should run right now.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Short summary of what was done / what you are waiting for',
        },
      },
      required: ['reason'],
    },
  },
]
