'use server'

import { run } from '@/lib/actions'
import * as admin from '@/lib/nextcloud/admin'

const uid = (v: unknown) => {
  const s = String(v ?? '').trim()
  // Nextcloud's allowed user/group id characters.
  if (!s || s.length > 64 || !/^[a-zA-Z0-9 _.@\-']+$/.test(s)) throw new Error('Use letters, digits and . _ - @ only (max 64).')
  return s
}
const str = (v: unknown, max = 255) => String(v ?? '').trim().slice(0, max)
const QUOTAS = new Set(['default', 'none', '1 GB', '5 GB', '10 GB', '50 GB', '100 GB'])
const quota = (q: unknown) => {
  const v = String(q ?? 'default')
  if (QUOTAS.has(v) || /^\d+(\.\d+)? ?(MB|GB|TB)$/i.test(v)) return v
  throw new Error('Invalid quota.')
}

export async function loadUsers(filter: { search?: string; group?: string; offset?: number }) {
  return run((s) => admin.listUsers(s, { search: str(filter.search, 100), group: filter.group ? uid(filter.group) : undefined, offset: Math.max(0, Number(filter.offset) || 0), limit: 50 }))
}

/** Without a password Nextcloud emails an invite with a set-password link (email required). */
export async function createUser(input: { id: string; displayName: string; email: string; password: string | null; groups: string[]; quota: string }) {
  return run(async (s) => {
    const email = str(input.email)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That email address doesn’t look right.')
    if (!input.password && !email) throw new Error('An invite needs an email address.')
    const id = await admin.createUser(s, {
      id: uid(input.id),
      displayName: str(input.displayName),
      email: email || undefined,
      password: input.password || undefined,
      groups: input.groups.map(uid),
      quota: input.quota && input.quota !== 'default' ? quota(input.quota) : undefined,
    })
    return admin.getUser(s, id)
  })
}

export async function updateUser(id: string, fields: { displayname?: string; email?: string; quota?: string }) {
  return run(async (s) => {
    const u = uid(id)
    if (fields.displayname !== undefined) await admin.editUser(s, u, 'displayname', str(fields.displayname) || u)
    if (fields.email !== undefined) await admin.editUser(s, u, 'email', str(fields.email))
    if (fields.quota !== undefined) await admin.editUser(s, u, 'quota', quota(fields.quota))
    return admin.getUser(s, u)
  })
}

export async function setUserEnabled(id: string, enabled: boolean) {
  return run(async (s) => {
    if (uid(id) === s.userId) throw new Error('You can’t disable your own account.')
    await admin.setUserEnabled(s, uid(id), Boolean(enabled))
    return admin.getUser(s, uid(id))
  })
}

export async function setUserGroup(id: string, group: string, on: boolean) {
  return run(async (s) => {
    if (!on && group === 'admin' && uid(id) === s.userId) throw new Error('You can’t remove your own admin rights.')
    await admin.setUserGroup(s, uid(id), uid(group), Boolean(on))
    return admin.getUser(s, uid(id))
  })
}

export async function setUserSubadmin(id: string, group: string, on: boolean) {
  return run(async (s) => {
    await admin.setUserSubadmin(s, uid(id), uid(group), Boolean(on))
    return admin.getUser(s, uid(id))
  })
}

export async function setUserPassword(id: string, password: string) {
  return run(async (s) => {
    if (!password) throw new Error('Enter a password.')
    await admin.editUser(s, uid(id), 'password', String(password))
    return null
  })
}

export async function resendInvite(id: string) {
  return run(async (s) => {
    await admin.resendWelcome(s, uid(id))
    return null
  })
}

export async function deleteUser(id: string) {
  return run(async (s) => {
    if (uid(id) === s.userId) throw new Error('You can’t delete your own account here.')
    await admin.deleteUser(s, uid(id))
    return null
  })
}

export async function loadGroups() {
  return run((s) => admin.listGroups(s))
}

export async function createGroup(name: string) {
  return run(async (s) => {
    const display = str(name, 64)
    // The id is the name made safe; Nextcloud shows the display name everywhere.
    const id = uid(display.replace(/[^a-zA-Z0-9 _.@\-']/g, '-'))
    await admin.createGroup(s, id, display)
    return admin.listGroups(s)
  })
}

export async function renameGroup(id: string, name: string) {
  return run(async (s) => {
    await admin.renameGroup(s, uid(id), str(name, 64) || uid(id))
    return admin.listGroups(s)
  })
}

export async function deleteGroup(id: string) {
  return run(async (s) => {
    if (uid(id) === 'admin') throw new Error('The admin group can’t be deleted.')
    await admin.deleteGroup(s, uid(id))
    return admin.listGroups(s)
  })
}
