/**worker publishes session events,
 * SSE route subscribes and forwards to browser.
 */
import Redis from 'ioredis'

export class PubSub {
  private readonly publisher: Redis
  private readonly subscriber: Redis

  constructor(redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6380') {
    this.publisher = new Redis(redisUrl)
    this.subscriber = new Redis(redisUrl)
    this.publisher.on('error', () => {})
    this.subscriber.on('error', () => {})
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(payload))
  }

  subscribe(channel: string, onMessage: (payload: unknown) => void): () => void {
    const handler = (ch: string, message: string) => {
      if (ch === channel) {
        try {
          onMessage(JSON.parse(message))
        } catch {
          onMessage(message)
        }
      }
    }
    this.subscriber.on('message', handler)
    void this.subscriber.subscribe(channel).catch(() => {})
    return () => {
      this.subscriber.removeListener('message', handler)
      void this.subscriber.unsubscribe(channel).catch(() => {})
    }
  }

  async close(): Promise<void> {
    this.publisher.disconnect()
    this.subscriber.disconnect()
  }
}
