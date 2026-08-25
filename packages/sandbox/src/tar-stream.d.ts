declare module 'tar-stream' {
  import type { Readable } from 'node:stream'

  export interface TarHeader {
    name: string
    size?: number
    mode?: number
    uid?: number
    gid?: number
    mtime?: Date
    type?: string
  }

  export interface Pack extends Readable {
    entry(header: TarHeader, content?: Uint8Array | string): boolean
    finalize(): void
  }

  export function pack(): Pack
}
