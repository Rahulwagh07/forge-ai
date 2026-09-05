import { DEFAULT_CONTEXT_WINDOW } from '../../../constants.ts'

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o-mini': 128_000,
  'gpt-4o': 128_000,
}

export function resolveContextWindow(model: string): number {
  const modelWithoutProvider = model.includes('/') ? (model.split('/').pop() ?? model) : model
  return MODEL_CONTEXT_WINDOWS[modelWithoutProvider] ?? DEFAULT_CONTEXT_WINDOW
}
