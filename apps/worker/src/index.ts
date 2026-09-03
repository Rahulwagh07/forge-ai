import { configDotenv } from 'dotenv'
configDotenv()

import { Consumer } from './consumer.ts'
import { log } from './log.ts'

const consumer = new Consumer('worker-1')

const shutdown = async () => {
  log.info('worker shutting down')
  await consumer.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

consumer.start().catch((err) => {
  log.error('worker fatal error', {
    error: err instanceof Error ? err.message : String(err),
  })
  process.exit(1)
})
