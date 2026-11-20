import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { WORKER_READY_TIMEOUT_MS, WORKER_STOP_TIMEOUT_MS } from './env.ts'

const WORKER_DIRECTORY = fileURLToPath(new URL('../../apps/worker', import.meta.url))
const READY_MARKER = '"msg":"consumer started"'
const OUTPUT_BUFFER_LIMIT = 20_000
const READY_POLL_INTERVAL_MS = 50

export interface WorkerController {
  readonly running: boolean
  start(): Promise<void>
  stop(): Promise<void>
}

export function createWorkerController(): WorkerController {
  let child: ChildProcess | null = null
  let output = ''

  function append(chunk: Buffer): void {
    output = `${output}${chunk.toString('utf8')}`.slice(-OUTPUT_BUFFER_LIMIT)
  }

  async function start(): Promise<void> {
    if (child && child.exitCode === null) return
    output = ''
    const worker = spawn(process.execPath, ['--import', 'tsx/esm', 'src/index.ts'], {
      cwd: WORKER_DIRECTORY,
      env: {
        ...process.env,
        WORKER_NAME: `e2e-worker-${process.pid}`,
        WORKER_CONCURRENCY: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child = worker
    worker.stdout?.on('data', append)
    worker.stderr?.on('data', append)

    try {
      await waitUntilReady(worker)
    } catch (error) {
      await stop()
      throw error
    }
  }

  function waitUntilReady(worker: ChildProcess): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + WORKER_READY_TIMEOUT_MS
      const poll = setInterval(() => {
        if (output.includes(READY_MARKER)) {
          clearInterval(poll)
          resolve()
          return
        }
        if (worker.exitCode !== null) {
          clearInterval(poll)
          reject(new Error(`worker exited before it was ready\n${output}`))
          return
        }
        if (Date.now() > deadline) {
          clearInterval(poll)
          reject(
            new Error(`worker did not become ready within ${WORKER_READY_TIMEOUT_MS}ms\n${output}`),
          )
        }
      }, READY_POLL_INTERVAL_MS)
    })
  }

  async function stop(): Promise<void> {
    const worker = child
    if (!worker) return
    child = null
    if (worker.exitCode !== null || worker.pid === undefined) return

    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        execFile('taskkill', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true }, () =>
          resolve(),
        )
      })
    } else {
      worker.kill('SIGTERM')
    }

    await new Promise<void>((resolve) => {
      if (worker.exitCode !== null) {
        resolve()
        return
      }
      const timer = setTimeout(resolve, WORKER_STOP_TIMEOUT_MS)
      worker.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  return {
    get running() {
      return child !== null && child.exitCode === null
    },
    start,
    stop,
  }
}
