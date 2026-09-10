import { DockerSandboxProvider } from './providers/docker.ts'
import type { SandboxProvider } from './provider.ts'
import { env } from './env.ts'

export { shellQuote } from './utils.ts'
export type { CommandResult, OutputChunk, SandboxHandle, SandboxProvider } from './provider.ts'

export function getSandboxProvider(): SandboxProvider {
  switch (env.SANDBOX_PROVIDER) {
    case 'docker':
      return new DockerSandboxProvider()
    case 'e2b':
      throw new Error('[sandbox] e2b is not implemented yet')
    default:
      throw new Error(`[sandbox] unknown SANDBOX_PROVIDER: ${env.SANDBOX_PROVIDER}`)
  }
}
