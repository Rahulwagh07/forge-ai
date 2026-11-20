import { cleanupStaleE2ESessions } from './helpers/cleanup.ts'

export default async function globalTeardown(): Promise<void> {
  await cleanupStaleE2ESessions()
}
