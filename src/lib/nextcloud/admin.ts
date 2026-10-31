import 'server-only'
import { cache } from 'react'
import type { Session } from '../session'
import { NextcloudError, ocs } from './http'

/**
 * Nextcloud's user and group provisioning API. Nextcloud enforces who may do
 * what: admins everything, group admins ("sub-admins") only users in their
 * groups; everyone else gets 403.
 */

export type AdminUser = {
  id: string
  displayname: string
  email: string | null
  enabled: boolean
  groups: string[]
  subadmin: string[]
  /** ms since epoch, 0 = never */
  lastLogin: number
  backend: string
  quota: { used?: number; quota?: number | string; relative?: number }
  backendCapabilities?: { setDisplayName?: boolean; setPassword?: boolean }
}

export type AdminGroup = { id: string; displayname: string; usercount: number; disabled: number; canAdd: boolean; canRemove: boolean }

/** What the signed-in user may administer. */
export type AdminScope = { isAdmin: boolean; subadminOf: string[] }

type RawUser = Omit<AdminUser, 'enabled'> & { enabled: boolean | number | string; 'display-name'?: string }

const toUser = (u: RawUser): AdminUser => ({
  id: u.id,
  displayname: u.displayname || u['display-name'] || u.id,
  email: u.email || null,
  enabled: u.enabled === true || u.enabled === 1 || u.enabled === '1' || u.enabled === 'true',
  groups: u.groups ?? [],
  subadmin: u.subadmin ?? [],
  lastLogin: Number(u.lastLogin) || 0,
  backend: u.backend,
  quota: u.quota ?? {},
  backendCapabilities: u.backendCapabilities,
})

/** Cached per request: the layout and admin pages both ask. */
export const getAdminScope = cache(async (s: Session): Promise<AdminScope> => {
  const me = await ocs<RawUser>(s, `/cloud/users/${encodeURIComponent(s.userId)}`)
  return { isAdmin: (me.groups ?? []).includes('admin'), subadminOf: me.subadmin ?? [] }
})

export async function listUsers(s: Session, opts: { search?: string; group?: string; limit?: number; offset?: number }): Promise<AdminUser[]> {
  const q = new URLSearchParams({ search: opts.search ?? '', limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) })
  const path = opts.group ? `/cloud/groups/${encodeURIComponent(opts.group)}/users/details?${q}` : `/cloud/users/details?${q}`
  const data = await ocs<{ users: Record<string, RawUser> | RawUser[] }>(s, path)
  // Nextcloud returns an object keyed by id (or [] when empty); entries can be [] for users it can't read.
  return Object.values(data.users ?? {})
    .filter((u): u is RawUser => Boolean(u && (u as RawUser).id))
    .map(toUser)
}

export const getUser = async (s: Session, id: string) => toUser(await ocs<RawUser>(s, `/cloud/users/${encodeURIComponent(id)}`))

export async function createUser(
  s: Session,
  u: { id: string; displayName?: string; email?: string; password?: string; groups: string[]; quota?: string },
): Promise<string> {
  const body = new URLSearchParams({ userid: u.id })
  if (u.displayName) body.set('displayName', u.displayName)
  if (u.email) body.set('email', u.email)
  if (u.password) body.set('password', u.password)
  if (u.quota) body.set('quota', u.quota)
  for (const g of u.groups) body.append('groups[]', g)
  const created = await ocs<{ id: string }>(s, '/cloud/users', { method: 'POST', raw: body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  return created.id
}

const form = (fields: Record<string, string>) => ({ raw: new URLSearchParams(fields), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })

/** key: displayname | email | quota | password | language … */
export const editUser = (s: Session, id: string, key: string, value: string) =>
  ocs<unknown>(s, `/cloud/users/${encodeURIComponent(id)}`, { method: 'PUT', ...form({ key, value }) })

export const setUserEnabled = (s: Session, id: string, enabled: boolean) =>
  ocs<unknown>(s, `/cloud/users/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`, { method: 'PUT' })

export const deleteUser = (s: Session, id: string) => ocs<unknown>(s, `/cloud/users/${encodeURIComponent(id)}`, { method: 'DELETE' })

/** Re-sends the "account created" email (with a set-password link). */
export const resendWelcome = (s: Session, id: string) => ocs<unknown>(s, `/cloud/users/${encodeURIComponent(id)}/welcome`, { method: 'POST' })

export const setUserGroup = (s: Session, id: string, group: string, on: boolean) =>
  ocs<unknown>(s, `/cloud/users/${encodeURIComponent(id)}/groups`, on ? { method: 'POST', ...form({ groupid: group }) } : { method: 'DELETE', ...form({ groupid: group }) })

export const setUserSubadmin = (s: Session, id: string, group: string, on: boolean) =>
  ocs<unknown>(s, `/cloud/users/${encodeURIComponent(id)}/subadmins`, on ? { method: 'POST', ...form({ groupid: group }) } : { method: 'DELETE', ...form({ groupid: group }) })

export async function listGroups(s: Session, search = ''): Promise<AdminGroup[]> {
  try {
    const { groups } = await ocs<{ groups: AdminGroup[] }>(s, `/cloud/groups/details?search=${encodeURIComponent(search)}&limit=500`)
    return groups
  } catch (err) {
    // The detailed list is admins-only; group admins get the groups they manage.
    if (!(err instanceof NextcloudError) || err.status !== 403) throw err
    const { subadminOf } = await getAdminScope(s)
    return Promise.all(
      subadminOf.map(async (id) => {
        const { users } = await ocs<{ users: string[] }>(s, `/cloud/groups/${encodeURIComponent(id)}`)
        return { id, displayname: id, usercount: users.length, disabled: 0, canAdd: true, canRemove: true }
      }),
    )
  }
}

export async function createGroup(s: Session, id: string, displayName: string) {
  await ocs<unknown>(s, '/cloud/groups', { method: 'POST', ...form({ groupid: id, displayname: displayName || id }) })
}

export const renameGroup = (s: Session, id: string, displayName: string) =>
  ocs<unknown>(s, `/cloud/groups/${encodeURIComponent(id)}`, { method: 'PUT', ...form({ key: 'displayname', value: displayName }) })

export const deleteGroup = (s: Session, id: string) => ocs<unknown>(s, `/cloud/groups/${encodeURIComponent(id)}`, { method: 'DELETE' })

export { NextcloudError }
