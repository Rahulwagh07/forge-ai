import axios from 'axios'
import { API } from './constants'

export type SessionSummary = {
  id: string
  prompt: string
  createdAt: string
  status: string
  repoFullName?: string
}

type RequeueResult = { sessionId: string; status: string; queued: boolean }

async function request<T>(url: string, init?: Record<string, unknown>): Promise<T> {
  const res = await axios(url, init)
  return res.data as T
}

export function sessionStreamUrl(sessionId: string): string {
  return `${API.sessions}/${sessionId}/stream`
}

export function createSession(input: {
  repoId: string
  prompt: string
  mode: 'ASK' | 'AGENT'
  baseBranch?: string
}): Promise<{ sessionId: string; status: string }> {
  return request(API.sessions, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: input,
  })
}

export function listBranches(repoId: string): Promise<{ defaultBranch: string; branches: string[] }> {
  return request(`${API.repos}/${repoId}/branches`)
}

export function listSessions(): Promise<{ sessions: SessionSummary[] }> {
  return request(API.sessions)
}

export function searchSessions(q: string): Promise<{ sessions: SessionSummary[] }> {
  return request(`${API.sessions}?q=${encodeURIComponent(q)}`)
}

export function sendSteering(sessionId: string, message: string): Promise<void> {
  return request(`${API.sessions}/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { message },
  })
}

export function wakeSession(sessionId: string): Promise<RequeueResult> {
  return request(`${API.sessions}/${sessionId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { action: 'wake' },
  })
}

export function retrySession(sessionId: string): Promise<RequeueResult> {
  return request(`${API.sessions}/${sessionId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { action: 'retry' },
  })
}

export function syncRepositories(): Promise<{ synced: number; repos: string[] }> {
  return request(API.githubSync, { method: 'POST' })
}
