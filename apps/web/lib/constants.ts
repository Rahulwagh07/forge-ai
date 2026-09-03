export const MOBILE_BREAKPOINT = 768
export const SESSION_LIST_REFRESH_MS = 10_000
export const SSE_KEEPALIVE_MS = 15_000
export const TERMINAL_SCROLLBACK = 10_000
export const TITLE_MAX_LENGTH = 72
export const TITLE_TRUNCATE_LENGTH = 70
export const ERROR_PREVIEW_LENGTH = 240
export const DOCK_WIDTH_DEFAULT = 50
export const DOCK_WIDTH_MIN = 30
export const DOCK_WIDTH_MAX = 70

export const DEFAULT_BRANCH_LABEL = 'main'

export const GITHUB_INSTALLATIONS_URL = 'https://github.com/settings/installations'

export const API = {
  sessions: '/api/sessions',
  githubSync: '/api/github/sync',
  githubCallback: '/api/github/callback',
} as const
