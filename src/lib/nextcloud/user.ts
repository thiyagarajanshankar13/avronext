import 'server-only'
import { nextcloudUrl } from '../env'
import { basicAuth, NextcloudError, USER_AGENT } from './http'

type OcsUser = { id: string; displayname?: string; 'display-name'?: string; email?: string | null }

/** Validates credentials and returns the account behind them. */
export async function fetchCurrentUser(loginName: string, password: string) {
  const res = await fetch(`${nextcloudUrl()}/ocs/v2.php/cloud/user?format=json`, {
    headers: { Authorization: basicAuth(loginName, password), 'OCS-APIRequest': 'true', 'User-Agent': USER_AGENT },
    cache: 'no-store',
  })
  if (res.status === 401) return null
  if (!res.ok) throw new NextcloudError(`Nextcloud returned ${res.status}`, res.status, '/cloud/user')
  const data = (await res.json()) as { ocs: { data: OcsUser } }
  const u = data.ocs.data
  return { userId: u.id, displayName: u.displayname || u['display-name'] || u.id, email: u.email ?? null }
}

/** Revokes the app password the session is using (logout). Best effort. */
export async function revokeAppPassword(loginName: string, appPassword: string) {
  try {
    await fetch(`${nextcloudUrl()}/ocs/v2.php/core/apppassword?format=json`, {
      method: 'DELETE',
      headers: { Authorization: basicAuth(loginName, appPassword), 'OCS-APIRequest': 'true', 'User-Agent': USER_AGENT },
      cache: 'no-store',
    })
  } catch {
    /* ignore: the cookie is cleared regardless */
  }
}
