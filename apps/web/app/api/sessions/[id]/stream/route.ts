import { NextRequest } from 'next/server'
import { PubSub } from '@repo/redis'
import { requireOwnedSession, requireUser } from '@/lib/auth-guards'
import { SSE_KEEPALIVE_MS } from '@/lib/constants'
import { log } from '@/lib/log'
import { parseParams } from '@/lib/validation'
import { idParamSchema } from '@/lib/schemas/common'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params

  const parsed = parseParams({ id: sessionId }, idParamSchema)
  if ('error' in parsed) return parsed.error

  const user = await requireUser()
  if ('error' in user) return user.error

  const owned = await requireOwnedSession(sessionId, user.data.userId, {
    id: true,
  })
  if ('error' in owned) return owned.error

  const encoder = new TextEncoder()
  const pubsub = new PubSub()
  let closeStream: (() => void) | undefined

  const stream = new ReadableStream({
    async start(controller) {
      const channel = `session:${sessionId}:events`
      let closed = false
      let heartbeat: ReturnType<typeof setInterval> | undefined
      let unsubscribe: (() => void) | undefined

      const close = () => {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        unsubscribe?.()
        void pubsub.close()
        try {
          controller.close()
        } catch {
          // The browser may have already cancelled the stream.
        }
      }
      closeStream = close

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'init', session: { id: sessionId } })}\n\n`),
      )

      heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'))
        } catch {
          close()
        }
      }, SSE_KEEPALIVE_MS)

      unsubscribe = pubsub.subscribe(channel, (payload: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))

          const event = payload as { type?: string; status?: string }
          if (event.type === 'status' && (event.status === 'DONE' || event.status === 'FAILED')) {
            close()
          }
        } catch (err) {
          log.error('SSE stream error', {
            error: err instanceof Error ? err.message : String(err),
          })
          close()
        }
      })

      request.signal.addEventListener('abort', close, { once: true })
    },
    cancel() {
      closeStream?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
