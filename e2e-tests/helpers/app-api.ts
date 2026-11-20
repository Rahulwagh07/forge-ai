import { request as createRequest, type APIRequestContext } from '@playwright/test'
import { BASE_URL, STORAGE_STATE_PATH } from './env.ts'

export interface AppSession {
  id: string
  prompt: string
  status: string
  repoFullName?: string
}

export async function createAppApi(): Promise<APIRequestContext> {
  return createRequest.newContext({
    baseURL: BASE_URL,
    storageState: STORAGE_STATE_PATH,
  })
}

export async function listAppSessions(
  api: APIRequestContext,
  query?: string,
): Promise<AppSession[]> {
  const response = await api.get('/api/sessions', {
    params: query ? { q: query } : undefined,
  })
  if (!response.ok()) {
    throw new Error(`failed to list app sessions: ${response.status()} ${await response.text()}`)
  }
  const body = (await response.json()) as { sessions: AppSession[] }
  return body.sessions
}

export async function stopAppSession(api: APIRequestContext, sessionId: string): Promise<void> {
  const response = await api.post(`/api/sessions/${sessionId}/stop`)
  if (!response.ok() && response.status() !== 404) {
    throw new Error(`failed to stop session ${sessionId}: ${response.status()}`)
  }
}

export async function deleteAppSession(api: APIRequestContext, sessionId: string): Promise<number> {
  const response = await api.delete(`/api/sessions/${sessionId}`)
  return response.status()
}
