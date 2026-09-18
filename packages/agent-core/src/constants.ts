export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1'
export const OPENCODE_GO_DEFAULT_MODEL = 'mimo-v2.5'
export const MAX_TOOL_OUTPUT_CHARS = 10_000
export const TOOL_OUTPUT_OVERFLOW_CHARS = 20_000
export const TOOL_OUTPUT_PREVIEW_CHARS = 8000
export const READ_DEFAULT_MAX_LINES = 2000
export const READ_DEFAULT_MAX_BYTES = 64 * 1024
export const STEERING_MESSAGE_CHARS = 8000
export const MAX_COMMAND_TIMEOUT_MS = 10 * 60 * 1000
export const DEFAULT_CONTEXT_WINDOW = 128_000
export const DEFAULT_PROVIDER_TIMEOUT_MS = 60_000
export const DEFAULT_PROVIDER_MAX_RETRIES = 3
export const MAX_REPEATED_TOOL_BATCH = 3
export const MAX_CONSECUTIVE_TOOL_ERROR_BATCHES = 5
export const REPEATED_TOOL_BATCH_NUDGE =
  'The last tool batches were identical with no progress. Stop repeating yourself: re-read the tool output, try a different approach, or call finishSession if blocked.'
