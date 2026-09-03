import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    userId?: string
    googleId?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    googleId?: string
    dbUserId?: string
  }
}
