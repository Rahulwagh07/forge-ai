import { prisma } from 'db'
import { env } from '../env.ts'
import { runSession } from '../sessions/run.ts'
import { startSandboxCleanup } from '../sandbox/manager.ts'
import { log } from './log.ts'

const POLL_INTERVAL_MS = 1000
const RECLAIM_INTERVAL_MS = 30_000
const STALE_SESSION_SECONDS = 120

// Max sessions this worker runs concurrently
const CONCURRENCY = env.WORKER_CONCURRENCY

const CLAIM_NEXT_SQL = `UPDATE "Session" s
SET "status" = 'RUNNING', "lastActiveAt" = now()
WHERE s."id" = (
  SELECT "id" FROM "Session"
  WHERE "status" = 'QUEUED'
  ORDER BY "createdAt"
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING s."id"`

const RECLAIM_STALE_SQL = `UPDATE "Session" s
SET "status" = 'QUEUED', "lastActiveAt" = now()
WHERE s."status" = 'RUNNING'
  AND s."lastActiveAt" < now() - ($1 || ' seconds')::interval
RETURNING s."id"`

export class Consumer {
  private readonly name: string
  private running = false
  // sessions this process is actively running
  private readonly activeSessions = new Set<string>()

  constructor(name = env.WORKER_NAME) {
    this.name = name
  }

  async start(): Promise<void> {
    this.running = true
    log.info('consumer started', { name: this.name })
    const stopSandboxCleanup = startSandboxCleanup()

    // periodic stale-session reclaim (worker crash recovery). A heartbeat keeps
    // lastActiveAt fresh while a session runs, so no worker reclaims a live
    // session, even across processes
    const reclaimInterval = setInterval(async () => {
      try {
        const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
          RECLAIM_STALE_SQL,
          String(STALE_SESSION_SECONDS),
        )
        for (const row of rows) {
          log.info('reclaimed stale session', { sessionId: row.id })
        }
      } catch (err) {
        log.error('reclaim sweep error', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }, RECLAIM_INTERVAL_MS)

    while (this.running) {
      if (this.activeSessions.size >= CONCURRENCY) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        continue
      }
      try {
        const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(CLAIM_NEXT_SQL)
        const sessionId = rows[0]?.id
        if (!sessionId) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
          continue
        }
        log.info('claimed session', { sessionId })
        this.activeSessions.add(sessionId)
        void this.process(sessionId)
      } catch (err) {
        log.error('error claiming session', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    clearInterval(reclaimInterval)
    stopSandboxCleanup()
  }

  private async process(sessionId: string): Promise<void> {
    try {
      await runSession(sessionId)
    } catch (err) {
      log.error('error processing session', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      this.activeSessions.delete(sessionId)
    }
  }

  stop(): void {
    this.running = false
  }

  async close(): Promise<void> {
    this.stop()
  }
}
