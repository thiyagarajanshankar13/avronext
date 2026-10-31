'use server'

import { run } from '@/lib/actions'
import * as files from '@/lib/nextcloud/files'
import { joinPath, parentOf, SHARE, type DriveItem } from '@/lib/nextcloud/files'
import { loadFilesView, type FilesView } from './data'

/** Fresh listing for the browser (folder change, tab refocus, after uploads). */
export async function reloadView(view: FilesView, path: string) {
  return run((s) => loadFilesView(s, view, path))
}

export async function listSubfolders(path: string) {
  return run(async (s) => {
    const { folder, folders } = await files.listSubfolders(s, path)
    return { path: folder.path, canCreate: folder.permissions.includes('C'), folders: folders.map((f) => ({ path: f.path, name: f.name })) }
  })
}

export async function createFolder(parent: string, name: string) {
  return run((s) => files.createFolder(s, parent, name))
}

/** Folders for an upload of a whole folder, parents first. */
export async function ensureFolders(base: string, dirs: string[]) {
  return run((s) => files.ensureFolders(s, base, dirs.slice(0, 2000)))
}

export async function renameItem(path: string, name: string) {
  return run((s) => {
    const p = files.cleanPath(path)
    return files.transfer(s, 'MOVE', p, joinPath(parentOf(p), files.checkName(name)))
  })
}

type Outcome = { path: string; item?: DriveItem; error?: string }

/**
 * Moves or copies items into `dest`. Copies that land in their own folder get
 * "name (2)"; anything else that clashes is reported, not overwritten.
 */
export async function moveItems(paths: string[], dest: string, op: 'move' | 'copy') {
  return run(async (s) => {
    const target = files.cleanPath(dest)
    const { items } = await files.listFolder(s, target)
    const taken = new Set(items.map((i) => i.name))
    const out: Outcome[] = []
    for (const raw of paths.slice(0, 500)) {
      try {
        const p = files.cleanPath(raw)
        const name = p.slice(p.lastIndexOf('/') + 1)
        if (op === 'move' && parentOf(p) === target) {
          out.push({ path: p, error: 'It’s already in that folder.' })
          continue
        }
        const finalName = op === 'copy' && parentOf(p) === target ? files.freeName(name, taken) : name
        const item = await files.transfer(s, op === 'move' ? 'MOVE' : 'COPY', p, joinPath(target, finalName))
        taken.add(finalName)
        out.push({ path: p, item })
      } catch (err) {
        out.push({ path: raw, error: err instanceof Error ? err.message : 'Failed.' })
      }
    }
    return out
  })
}

export async function deleteItems(paths: string[]) {
  return run(async (s) => {
    const out: Outcome[] = []
    for (const raw of paths.slice(0, 500)) {
      try {
        await files.deleteItem(s, raw)
        out.push({ path: raw })
      } catch (err) {
        out.push({ path: raw, error: err instanceof Error ? err.message : 'Failed.' })
      }
    }
    return out
  })
}

export async function setFavorite(path: string, favorite: boolean) {
  return run((s) => files.setFavorite(s, path, Boolean(favorite)))
}

// ---- Sharing ----

export type ShareRole = 'view' | 'edit'

/** Nextcloud permission bits: read 1, update 2, create 4, delete 8, share 16. */
function peoplePermissions(role: ShareRole, isDir: boolean) {
  if (role === 'view') return 1 | 16
  return isDir ? 31 : 19
}
function linkPermissions(role: ShareRole, isDir: boolean) {
  if (role === 'view') return 1
  return isDir ? 15 : 3
}

export async function loadShares(path: string) {
  return run((s) => files.sharesFor(s, path))
}

export async function shareWithPeople(path: string, isDir: boolean, people: { kind: 'user' | 'group' | 'team'; id: string }[], role: ShareRole) {
  return run(async (s) => {
    const errors: string[] = []
    for (const p of people.filter((x) => ['user', 'group', 'team'].includes(x.kind)).slice(0, 50)) {
      try {
        await files.createShare(s, { path, type: SHARE[p.kind], shareWith: p.id, permissions: peoplePermissions(role, isDir) })
      } catch (err) {
        errors.push(`${p.id}: ${err instanceof Error ? err.message : 'failed'}`)
      }
    }
    return { shares: await files.sharesFor(s, path), errors }
  })
}

export async function setShareRole(id: string, role: ShareRole, isDir: boolean, isLink: boolean) {
  return run((s) => files.updateShare(s, id, { permissions: isLink ? linkPermissions(role, isDir) : peoplePermissions(role, isDir) }))
}

export async function createLink(path: string) {
  return run((s) => files.createShare(s, { path, type: SHARE.link, permissions: 1 }))
}

/** Link settings: password ("" removes it), expiry date YYYY-MM-DD ("" removes it). */
export async function updateLink(id: string, data: { password?: string; expireDate?: string; label?: string }) {
  return run((s) => {
    if (data.expireDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.expireDate)) throw new Error('Pick a valid date.')
    return files.updateShare(s, id, {
      password: data.password === undefined ? undefined : String(data.password).slice(0, 200),
      expireDate: data.expireDate,
      label: data.label === undefined ? undefined : String(data.label).slice(0, 100),
    })
  })
}

export async function removeShare(id: string) {
  return run((s) => files.deleteShare(s, String(id)))
}
