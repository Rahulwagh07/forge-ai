import { DockerSandboxProvider } from './providers/docker.ts'
import type { SandboxProvider } from './provider.ts'

export { DockerSandboxProvider }
export type {
  CommandResult,
  CreateSandboxOptions,
  OutputChunk,
  RunCommandOptions,
  SandboxHandle,
  SandboxProvider,
} from './provider.ts'

export function getSandboxProvider(): SandboxProvider {
  switch (process.env.SANDBOX_PROVIDER ?? 'docker') {
    case 'docker':
      return new DockerSandboxProvider()
    case 'e2b':
      throw new Error('[sandbox] e2b is not implemented yet')
    default:
      throw new Error(`[sandbox] unknown SANDBOX_PROVIDER: ${process.env.SANDBOX_PROVIDER}`)
  }
}
