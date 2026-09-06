import {
  OPENCODE_GO_BASE_URL,
  OPENCODE_GO_DEFAULT_MODEL,
  OPENROUTER_BASE_URL,
  OPENROUTER_DEFAULT_MODEL,
} from '../../../constants.ts'

export interface ApiCredentials {
  apiKey: string
  baseURL?: string
  model: string
}

export interface CredentialInput {
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  OPENAI_MODEL?: string
  OPENROUTER_API_KEY?: string
}

export function resolveApiCredentials(
  explicitModel?: string,
  input: CredentialInput = {},
): ApiCredentials {
  if (input.OPENAI_API_KEY) {
    return {
      apiKey: input.OPENAI_API_KEY,
      // baseURL: input.OPENAI_BASE_URL,
      baseURL: OPENCODE_GO_BASE_URL,
      model: explicitModel ?? input.OPENAI_MODEL ?? OPENCODE_GO_DEFAULT_MODEL,
    }
  }

  if (input.OPENROUTER_API_KEY) {
    return {
      apiKey: input.OPENROUTER_API_KEY,
      baseURL: input.OPENAI_BASE_URL ?? OPENROUTER_BASE_URL,
      model: explicitModel ?? input.OPENAI_MODEL ?? OPENROUTER_DEFAULT_MODEL,
    }
  }

  throw new Error('[agent-core] no LLM credentials: set OPENAI_API_KEY or OPENROUTER_API_KEY')
}
