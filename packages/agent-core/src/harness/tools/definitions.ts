import type { ToolDefinition } from '../provider.ts'

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'readFile',
    description:
      'Read the full contents of a file in the repo. Paths are absolute inside the sandbox (repo root is /workspace/repo).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
      },
      required: ['path'],
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
