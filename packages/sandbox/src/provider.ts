export interface OutputChunk {
  stream: 'stdout' | 'stderr'
  data: string
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface RunCommandOptions {
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  onOutput?: (chunk: OutputChunk) => void
}

export interface CreateSandboxOptions {
  repoCloneUrl: string
  //existing branch
  branch?: string
  //new ranch to create + check out after cloning (fresh sessions)
  createBranch?: string
  sessionId: string
  env?: Record<string, string>
}

export interface SandboxHandle {
  id: string
  runCommand(cmd: string, opts?: RunCommandOptions): Promise<CommandResult>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  listDir(path: string): Promise<string[]>
  destroy(): Promise<void>
}

export interface SandboxProvider {
  create(opts: CreateSandboxOptions): Promise<SandboxHandle>
  // List live sandboxes across the host keyed by session
  listSandboxes(): Promise<Array<{ id: string; sessionId: string }>>
  destroySandbox(id: string): Promise<void>
}
