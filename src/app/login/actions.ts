'use server'

import { cookies } from 'next/headers'
import { nextcloudPublicUrl, nextcloudUrl } from '@/lib/env'
import { basicAuth, USER_AGENT } from '@/lib/nextcloud/http'
import { fetchCurrentUser } from '@/lib/nextcloud/user'
import { cookieOptions, FLOW_COOKIE, saveSession, seal, unseal } from '@/lib/session'

type Flow = { token: string; endpoint: string }
export type LoginResult = { ok: true } | { ok: false; error: string }

/** Nextcloud builds Login Flow URLs from the host we called it on; swap in what the browser can reach. */
function toPublic(url: string) {
  return url.startsWith(nextcloudUrl()) ? nextcloudPublicUrl() + url.slice(nextcloudUrl().length) : url
}
function toInternal(url: string) {
  const pub = nextcloudPublicUrl()
  return url.startsWith(pub) ? nextcloudUrl() + url.slice(pub.length) : url
}

async function finishLogin(loginName: string, appPassword: string): Promise<LoginResult> {
  const user = await fetchCurrentUser(loginName, appPassword)
  if (!user) return { ok: false, error: 'Nextcloud did not accept those credentials.' }
  await saveSession({ loginName, userId: user.userId, displayName: user.displayName, appPassword })
  return { ok: true }
}

/** Login Flow v2, step 1: ask Nextcloud for a login URL the user approves in their browser. */
export async function startLoginFlow(): Promise<{ ok: true; loginUrl: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${nextcloudUrl()}/index.php/login/v2`, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, error: `Nextcloud refused to start a login (${res.status}).` }
    const data = (await res.json()) as { login: string; poll: Flow }
    const store = await cookies()
    store.set(FLOW_COOKIE, seal({ token: data.poll.token, endpoint: toInternal(data.poll.endpoint) }), cookieOptions(20 * 60))
    return { ok: true, loginUrl: toPublic(data.login) }
  } catch {
    return { ok: false, error: 'Could not reach Nextcloud. Check NEXTCLOUD_URL.' }
  }
}

/** Login Flow v2, step 2: poll until the user has approved access. */
export async function pollLoginFlow(): Promise<{ status: 'pending' } | { status: 'done' } | { status: 'error'; error: string }> {
  const store = await cookies()
  const flow = unseal<Flow>(store.get(FLOW_COOKIE)?.value)
  if (!flow) return { status: 'error', error: 'The login request expired. Please start again.' }
  // Only ever poll our own Nextcloud.
  if (!flow.endpoint.startsWith(nextcloudUrl() + '/')) return { status: 'error', error: 'Invalid login request.' }
  const res = await fetch(flow.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT, Accept: 'application/json' },
    body: new URLSearchParams({ token: flow.token }),
    cache: 'no-store',
  })
  if (res.status === 404) return { status: 'pending' }
  if (!res.ok) return { status: 'error', error: `Nextcloud returned ${res.status}.` }
  const data = (await res.json()) as { loginName: string; appPassword: string }
  store.delete(FLOW_COOKIE)
  const result = await finishLogin(data.loginName, data.appPassword)
  return result.ok ? { status: 'done' } : { status: 'error', error: result.error }
}

/**
 * Username + password (or an app password from Nextcloud > Settings > Security).
 * A real password is exchanged for an app password straight away and never stored.
 */
export async function passwordLogin(formData: FormData): Promise<LoginResult> {
  const loginName = String(formData.get('user') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!loginName || !password) return { ok: false, error: 'Enter your username and password.' }
  try {
    const res = await fetch(`${nextcloudUrl()}/ocs/v2.php/core/getapppassword?format=json`, {
      headers: { Authorization: basicAuth(loginName, password), 'OCS-APIRequest': 'true', 'User-Agent': USER_AGENT },
      cache: 'no-store',
    })
    if (res.status === 401) return { ok: false, error: 'Wrong username or password.' }
    // 403 = these credentials already are an app password.
    if (res.status === 403) return finishLogin(loginName, password)
    if (!res.ok) return { ok: false, error: `Nextcloud returned ${res.status}.` }
    const data = (await res.json()) as { ocs: { data: { apppassword: string } } }
    return finishLogin(loginName, data.ocs.data.apppassword)
  } catch {
    return { ok: false, error: 'Could not reach Nextcloud. Check NEXTCLOUD_URL.' }
  }
}
