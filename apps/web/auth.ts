import NextAuth from 'next-auth'
import type { NextAuthResult, Session } from 'next-auth'
import Google from 'next-auth/providers/google'
import { prisma } from '@repo/db'
import { env } from '@/env'

type GoogleProfileData = {
  sub?: string
  email?: string
  name?: string
  picture?: string
}

const nextAuth: NextAuthResult = NextAuth({
  trustHost: true,
  secret: env.NEXTAUTH_SECRET,
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 2 },
  callbacks: {
    async signIn({ profile }) {
      const p = profile as GoogleProfileData | undefined
      return !!(p?.sub && p?.email)
    },
    async jwt({ token, profile }) {
      const p = profile as GoogleProfileData | undefined
      if (p?.sub) {
        const user = await prisma.user.upsert({
          where: { googleId: p.sub },
          update: {
            email: p.email,
            name: p.name ?? undefined,
            avatarUrl: p.picture ?? undefined,
          },
          create: {
            googleId: p.sub,
            email: p.email!,
            name: p.name ?? null,
            avatarUrl: p.picture ?? null,
          },
        })
        token.googleId = p.sub
        token.dbUserId = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (typeof token.dbUserId === 'string') session.userId = token.dbUserId
      if (typeof token.googleId === 'string') session.googleId = token.googleId
      return session
    },
  },
})

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers
const auth: () => Promise<Session | null> = nextAuth.auth
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn

export async function getSession(): Promise<Session | null> {
  return await auth()
}
