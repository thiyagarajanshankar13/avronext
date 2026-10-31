import 'server-only'
import { redirect, unstable_rethrow } from 'next/navigation'
import { NextcloudAuthError } from './nextcloud/http'
import { requireSession, type Session } from './session'

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Runs a server action body with the signed-in session. Nextcloud errors come
 * back as `{ ok: false, error }` (thrown errors are masked in production).
 */
export async function run<T>(fn: (s: Session) => Promise<T>): Promise<Result<T>> {
  const session = await requireSession()
  try {
    return { ok: true, data: await fn(session) }
  } catch (err) {
    unstable_rethrow(err)
    if (err instanceof NextcloudAuthError) redirect('/logout?expired=1')
    console.error('[avronext] action failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
}
