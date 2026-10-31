import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { cookieSecure, sessionSecret } from './env'

/**
 * AvroNext keeps no server-side state. The only thing it remembers is this
 * cookie: the Nextcloud login name and an app password, encrypted with
 * AES-256-GCM under SESSION_SECRET. The browser can't read or forge it.
 */
export type Session = {
  /** Nextcloud login name (used for Basic auth). */
  loginName: string
  /** Nextcloud user id (used in WebDAV paths); usually equals loginName. */
  userId: string
  displayName: string
  appPassword: string
}

export const SESSION_COOKIE = 'avronext_session'
/** Short-lived cookie holding the Login Flow v2 poll token while the user approves. */
export const FLOW_COOKIE = 'avronext_flow'

const MAX_AGE = 60 * 60 * 24 * 30

function key(): Buffer {
  return createHash('sha256').update(sessionSecret()).digest()
}

export function seal(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

export function unseal<T>(token: string | undefined): T | null {
  if (!token) return null
  try {
    const raw = Buffer.from(token, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export function cookieOptions(maxAge = MAX_AGE) {
  return { httpOnly: true, secure: cookieSecure(), sameSite: 'lax' as const, path: '/', maxAge }
}

export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies()
  const session = unseal<Session>(store.get(SESSION_COOKIE)?.value)
  return session?.loginName && session.appPassword ? session : null
})

/** For pages and actions that need a signed-in user. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

/** Only callable from server actions / route handlers (cookies are read-only while rendering). */
export async function saveSession(session: Session) {
  const store = await cookies()
  store.set(SESSION_COOKIE, seal(session), cookieOptions())
}

export async function clearSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  store.delete(FLOW_COOKIE)
}
