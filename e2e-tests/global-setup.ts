import { writeStorageState } from './helpers/auth.ts'
import { cleanupStaleE2ESessions } from './helpers/cleanup.ts'
import { createAppApi } from './helpers/app-api.ts'
import { STORAGE_STATE_PATH, TEST_REPO_FULL_NAME } from './helpers/env.ts'

async function verifyAuthenticatedWorkspace(): Promise<void> {
  const api = await createAppApi()
  try {
    const sessions = await api.get('/api/sessions')
    if (!sessions.ok()) {
      throw new Error(
        `test user session was rejected by the app: ${sessions.status()} ${await sessions.text()}`,
      )
    }
    const home = await api.get('/')
    if (!home.ok()) throw new Error(`home page failed to load: ${home.status()}`)
    const html = await home.text()
    if (!html.includes(TEST_REPO_FULL_NAME)) {
      throw new Error(`repository ${TEST_REPO_FULL_NAME} is not connected to the test user`)
    }
  } finally {
    await api.dispose()
  }
}

export default async function globalSetup(): Promise<void> {
  await writeStorageState(STORAGE_STATE_PATH)
  await verifyAuthenticatedWorkspace()
  await cleanupStaleE2ESessions()
}
