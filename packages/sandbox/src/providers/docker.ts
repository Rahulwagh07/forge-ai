import { Writable } from 'node:stream'
import Dockerode from 'dockerode'
import * as tar from 'tar-stream'
import type {
  CommandResult,
  CreateSandboxOptions,
  OutputChunk,
  RunCommandOptions,
  SandboxHandle,
  SandboxProvider,
} from '../provider.ts'
import { getFileName, getLastLines, getParentDirectory, shellQuote } from '../utils.ts'
import { env } from '../env.ts'

const WORKSPACE_DIR = '/workspace'
const REPO_DIR = '/workspace/repo'
const DEFAULT_IMAGE = env.SANDBOX_IMAGE
const LABEL_APP = 'app.forge.sandbox'
const LABEL_SESSION = 'app.forge.session-id'
const DEFAULT_CMD_TIMEOUT_MS = 30 * 60 * 1000
const CLONE_TIMEOUT_MS = 120_000
const MEMORY_BYTES = env.SANDBOX_MEMORY_BYTES
const NANOCPUS = env.SANDBOX_NANOCPUS

export class DockerSandboxProvider implements SandboxProvider {
  private readonly docker: Dockerode
  private readonly image: string

  constructor(docker: Dockerode = new Dockerode(), image = DEFAULT_IMAGE) {
    this.docker = docker
    this.image = image
  }

  async create(opts: CreateSandboxOptions): Promise<SandboxHandle> {
    if (!opts.repoCloneUrl) {
      throw new Error('[sandbox] create() requires repoCloneUrl')
    }
    await this.ensureImage()

    const containerEnvVars = Object.entries(opts.env ?? {}).map(([k, v]) => `${k}=${v}`)

    let container: Dockerode.Container
    try {
      container = await this.docker.createContainer({
        name: `forge-sbx-${opts.sessionId}-${Date.now().toString(36)}`,
        Image: this.image,
        Labels: {
          [LABEL_APP]: 'true',
          [LABEL_SESSION]: opts.sessionId,
        },
        Env: containerEnvVars.length > 0 ? containerEnvVars : undefined,
        Entrypoint: ['sleep', 'infinity'],
        WorkingDir: WORKSPACE_DIR,
        HostConfig: {
          Memory: MEMORY_BYTES,
          NanoCpus: NANOCPUS,
        },
      })
    } catch (err) {
      throw new Error(`[sandbox] failed to create container (is Docker running?): ${String(err)}`)
    }

    try {
      await container.start()
    } catch (err) {
      // don't leak a created-but-unstartable container
      await container.remove({ force: true }).catch(() => {})
      throw new Error(`[sandbox] failed to start sandbox container: ${String(err)}`)
    }

    const handle = new DockerSandboxHandle(this.docker, container)

    try {
      await this.cloneRepo(handle, opts)
    } catch (err) {
      await handle.destroy()
      throw err
    }

    return handle
  }

  async listSandboxes(): Promise<Array<{ id: string; sessionId: string }>> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: JSON.stringify({ label: [LABEL_APP] }),
    })
    return containers
      .map((containerInfo) => {
        const sessionId = containerInfo.Labels?.[LABEL_SESSION]
        return sessionId ? { id: containerInfo.Id, sessionId } : null
      })
      .filter((entry): entry is { id: string; sessionId: string } => entry !== null)
  }

  async destroySandbox(id: string): Promise<void> {
    await this.docker.getContainer(id).remove({ force: true })
  }

  private async ensureImage(): Promise<void> {
    try {
      await this.docker.getImage(this.image).inspect()
      return
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode !== 404) throw err
    }

    await new Promise<void>((resolve, reject) => {
      this.docker.pull(this.image, (pullErr: Error | null, stream: NodeJS.ReadableStream) => {
        if (pullErr) return reject(pullErr)
        this.docker.modem.followProgress(stream as never, (progressErr) =>
          progressErr ? reject(progressErr) : resolve(),
        )
      })
    })
  }

  private async cloneRepo(handle: SandboxHandle, opts: CreateSandboxOptions): Promise<void> {
    const branchFlag = opts.branch ? `--branch ${shellQuote(opts.branch)} --single-branch ` : ''
    const cloneCmd = `git clone ${branchFlag}${shellQuote(opts.repoCloneUrl)} ${shellQuote(REPO_DIR)}`

    const result = await handle.runCommand(cloneCmd, {
      cwd: WORKSPACE_DIR,
      timeoutMs: CLONE_TIMEOUT_MS,
    })
    if (result.exitCode !== 0) {
      if (opts.branch && isMissingBranchError(result.stderr)) {
        await this.cloneEmptyRepo(handle, opts)
      } else {
        throw new Error(
          `[sandbox] git clone failed (exit ${result.exitCode}):\n${getLastLines(result.stderr)}`,
        )
      }
    }

    if (opts.createBranch) {
      const created = await handle.runCommand(`git checkout -b ${shellQuote(opts.createBranch)}`)
      if (created.exitCode !== 0) {
        throw new Error(
          `[sandbox] branch creation failed (${opts.createBranch}):\n${getLastLines(created.stderr)}`,
        )
      }
    }

    // Scrub the installation token out of the persisted origin URL
    await handle
      .runCommand(
        `git remote set-url origin "$(git remote get-url origin | sed -E 's#(https?://)[^/@]*@#\\1#')"`,
        { cwd: REPO_DIR },
      )
      .catch(() => {})
  }

  // Empty repos have no branches, so --branch always fails. Clone without it:
  // git lands on unborn HEAD and checkout -b / Q&A work normally.
  private async cloneEmptyRepo(handle: SandboxHandle, opts: CreateSandboxOptions): Promise<void> {
    await handle
      .runCommand(`rm -rf ${shellQuote(REPO_DIR)}`, { cwd: WORKSPACE_DIR })
      .catch(() => {})
    const retry = await handle.runCommand(
      `git clone ${shellQuote(opts.repoCloneUrl)} ${shellQuote(REPO_DIR)}`,
      { cwd: WORKSPACE_DIR, timeoutMs: CLONE_TIMEOUT_MS },
    )
    if (retry.exitCode !== 0) {
      throw new Error(
        `[sandbox] git clone failed (exit ${retry.exitCode}):\n${getLastLines(retry.stderr)}`,
      )
    }
  }
}

function isMissingBranchError(stderr: string): boolean {
  return /remote branch .* not found|remote HEAD refers to nonexistent|couldn't find remote ref/i.test(
    stderr,
  )
}

class DockerSandboxHandle implements SandboxHandle {
  readonly id: string

  constructor(
    private readonly docker: Dockerode,
    private readonly container: Dockerode.Container,
  ) {
    this.id = container.id.slice(0, 12)
  }

  async runCommand(cmd: string, opts: RunCommandOptions = {}): Promise<CommandResult> {
    // GNU `timeout` wraps the command so hung processes can't pin the session;
    // exit code 124 means we killed it.
    const timeoutSecs = Math.max(1, Math.ceil((opts.timeoutMs ?? DEFAULT_CMD_TIMEOUT_MS) / 1000))

    // Only override env when one is explicitly provided; otherwise let the
    // exec inherit the container env
    const envVars = opts.env ? Object.entries(opts.env).map(([k, v]) => `${k}=${v}`) : undefined

    const exec = await this.container.exec({
      Cmd: ['timeout', `${timeoutSecs}s`, 'sh', '-c', cmd],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: opts.cwd ?? REPO_DIR,
      Env: envVars,
    })

    const stream = await exec.start({ hijack: true, stdin: false })

    // Writable that accumulates one output stream and forwards chunks live
    const outputSink = (streamName: OutputChunk['stream'], chunks: Buffer[]) =>
      new Writable({
        write(chunk: Buffer, _enc, cb) {
          chunks.push(chunk)
          opts.onOutput?.({ stream: streamName, data: chunk.toString('utf8') })
          cb()
        },
      })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    this.docker.modem.demuxStream(
      stream,
      outputSink('stdout', stdoutChunks),
      outputSink('stderr', stderrChunks),
    )

    await new Promise<void>((resolve, reject) => {
      stream.on('error', reject)
      stream.on('end', () => resolve())
    })

    const execState = await exec.inspect()
    return {
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
      exitCode: execState.ExitCode ?? -1,
    }
  }

  /**
   * base64 round-trip keeps content byte-safe regardless of encoding.
   * Throws with the command's stderr when the file doesn't exist.
   */
  async readFile(path: string): Promise<string> {
    const result = await this.runCommand(`base64 -w0 -- ${shellQuote(path)}`, {
      cwd: WORKSPACE_DIR,
    })
    if (result.exitCode !== 0) {
      throw new Error(`[sandbox] readFile(${path}) failed:\n${getLastLines(result.stderr)}`)
    }
    return Buffer.from(result.stdout.trim(), 'base64').toString('utf8')
  }

  /**
   * Writes via tar + putArchive: no shell escaping issues, works for any content.
   * Parent directories are created on demand.
   */
  async writeFile(path: string, content: string): Promise<void> {
    if (!path.startsWith('/') || getFileName(path) === '') {
      throw new Error(`[sandbox] writeFile expects an absolute file path, got: ${path}`)
    }

    const dir = getParentDirectory(path)
    const mkdirResult = await this.runCommand(`mkdir -p -- ${shellQuote(dir)}`, {
      cwd: WORKSPACE_DIR,
    })
    if (mkdirResult.exitCode !== 0) {
      throw new Error(`[sandbox] writeFile mkdir failed:\n${getLastLines(mkdirResult.stderr)}`)
    }

    const pack = tar.pack()
    pack.entry(
      {
        name: getFileName(path),
        size: Buffer.byteLength(content, 'utf8'),
        mode: 0o644,
      },
      Buffer.from(content, 'utf8'),
    )
    pack.finalize()

    await this.container.putArchive(pack, { path: dir })
  }

  async listDir(path: string): Promise<string[]> {
    const result = await this.runCommand(`ls -1A -- ${shellQuote(path)}`, {
      cwd: WORKSPACE_DIR,
    })
    if (result.exitCode !== 0) {
      throw new Error(`[sandbox] listDir(${path}) failed:\n${getLastLines(result.stderr)}`)
    }
    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }

  async destroy(): Promise<void> {
    try {
      await this.container.remove({ force: true })
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode !== 404) throw err
    }
  }
}
