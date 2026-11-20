import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { encode } from 'next-auth/jwt'
import {
  NEXTAUTH_SECRET,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  TEST_USER_EMAIL,
  TEST_USER_GOOGLE_ID,
  TEST_USER_ID,
  TEST_USER_NAME,
} from './env.ts'

export async function writeStorageState(path: string): Promise<void> {
  const value = await encode({
    token: {
      sub: TEST_USER_GOOGLE_ID,
      dbUserId: TEST_USER_ID,
      googleId: TEST_USER_GOOGLE_ID,
      name: TEST_USER_NAME,
      email: TEST_USER_EMAIL,
    },
    secret: NEXTAUTH_SECRET,
    salt: SESSION_COOKIE_NAME,
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  })
  const state = {
    cookies: [
      {
        name: SESSION_COOKIE_NAME,
        value,
        domain: 'localhost',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + SESSION_COOKIE_MAX_AGE_SECONDS,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ],
    origins: [],
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}
