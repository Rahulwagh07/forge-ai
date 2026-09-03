import Dockerode from 'dockerode'
import { getSandboxProvider } from '../src/index.ts'
import type { OutputChunk } from '../src/index.ts'
import { configDotenv } from 'dotenv'
configDotenv()

const envRepoUrl = process.env.TEST_REPO_URL

if (!envRepoUrl) {
  console.error('TEST_REPO_URL is not defined')
  process.exit(1)
}
const REPO_URL: string = envRepoUrl

const docker = new Dockerode()
let passed = 0
let failed = 0

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  return fn()
    .then(() => {
      passed++
      console.log(`  ok    ${name}`)
    })
    .catch((err) => {
      failed++
      console.error(`  FAIL  ${name}\n        ${err instanceof Error ? err.message : String(err)}`)
    })
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

/** True if a container with this id exists on the Docker host. */
async function containerExists(containerId: string): Promise<boolean> {
  try {
    await docker.getContainer(containerId).inspect()
    return true
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return false
    throw err
  }
}

async function main(): Promise<void> {
  try {
    await docker.getImage('forge-sandbox:latest').inspect()
  } catch {
    console.error(
      'Image forge-sandbox:latest not found. Build it first:\n  docker build -t forge-sandbox:latest .',
    )
    process.exit(1)
  }

  const provider = getSandboxProvider()
  const sandbox = await provider.create({
    repoCloneUrl: REPO_URL,
    sessionId: 'smoke',
  })
  console.log(`sandbox created: ${sandbox.id}`)

  try {
    await step('runCommand: git log succeeds with output', async () => {
      const res = await sandbox.runCommand('git log --oneline -1')
      assert(res.exitCode === 0, `exit ${res.exitCode}: ${res.stderr}`)
      assert(res.stdout.trim().length > 0, 'empty stdout for git log')
    })

    await step('runCommand: stdout and stderr are separated', async () => {
      const res = await sandbox.runCommand(`echo out-marker && echo err-marker 1>&2`)
      assert(res.stdout.includes('out-marker'), `stdout missing marker: ${res.stdout}`)
      assert(res.stderr.includes('err-marker'), `stderr missing marker: ${res.stderr}`)
    })

    await step('runCommand: non-zero exit codes propagate', async () => {
      const res = await sandbox.runCommand('exit 7')
      assert(res.exitCode === 7, `expected exit 7, got ${res.exitCode}`)
    })

    await step('runCommand: onOutput streams incrementally', async () => {
      const chunks: OutputChunk[] = []
      const res = await sandbox.runCommand('echo stream-a && echo stream-b 1>&2', {
        onOutput: (c) => chunks.push(c),
      })
      assert(res.exitCode === 0, `exit ${res.exitCode}`)
      assert(
        chunks.some((c) => c.stream === 'stdout' && c.data.includes('stream-a')),
        'no stdout chunk',
      )
      assert(
        chunks.some((c) => c.stream === 'stderr' && c.data.includes('stream-b')),
        'no stderr chunk',
      )
    })

    await step('runCommand: timeout kills hung command', async () => {
      const started = Date.now()
      const res = await sandbox.runCommand('sleep 30', { timeoutMs: 2_000 })
      assert(Date.now() - started < 15_000, 'timeout did not fire promptly')
      assert(res.exitCode === 124, `expected exit 124 (timeout), got ${res.exitCode}`)
    })

    await step('cwd + env options apply', async () => {
      const res = await sandbox.runCommand('echo "$SMOKE_VAR"', {
        cwd: '/workspace',
        env: { SMOKE_VAR: 'env-works' },
      })
      assert(res.stdout.trim() === 'env-works', `got: ${res.stdout.trim()}`)
    })

    await step('writeFile/readFile round-trip incl. nested dirs + unicode', async () => {
      const content = '# hello\n\nline with ünïcödé and quotes "...\n'
      await sandbox.writeFile('/workspace/repo/smoke/nested/hello.md', content)
      const readBack = await sandbox.readFile('/workspace/repo/smoke/nested/hello.md')
      assert(readBack === content, 'round-trip content mismatch')
    })

    await step('readFile throws on missing file', async () => {
      let threw = false
      try {
        await sandbox.readFile('/workspace/repo/nope/missing.txt')
      } catch {
        threw = true
      }
      assert(threw, 'expected readFile to throw')
    })

    await step('listDir returns entries', async () => {
      const entries = await sandbox.listDir('/workspace/repo')
      assert(entries.includes('.git'), `.git missing: ${entries.join(', ')}`)
      assert(entries.length > 0, 'empty dir listing')
    })

    await step('agent can create a branch (commit path works)', async () => {
      await sandbox.writeFile('/workspace/repo/smoke/change.txt', 'branch work\n')
      const res = await sandbox.runCommand(
        `git checkout -b agent/smoke-test && git add -A && git -c user.email=sbx@forge.local -c user.name=smoke commit -m smoke`,
      )
      assert(res.exitCode === 0, `exit ${res.exitCode}: ${res.stderr}`)
    })

    await step('destroy removes the container', async () => {
      await sandbox.destroy()
      assert(!(await containerExists(sandbox.id)), 'container still exists after destroy()')
    })

    await step('destroy is idempotent', async () => {
      await sandbox.destroy()
    })
  } finally {
    //if an assert threw mid-step before the destroy step ran
    await sandbox.destroy().catch(() => {})
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
