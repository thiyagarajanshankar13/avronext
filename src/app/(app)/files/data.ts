import 'server-only'
import * as files from '@/lib/nextcloud/files'
import type { DriveItem, Share } from '@/lib/nextcloud/files'
import type { Session } from '@/lib/session'

export type FilesView = 'files' | 'recent' | 'favorites' | 'shared' | 'sharing'
export const FILES_VIEWS: FilesView[] = ['files', 'recent', 'favorites', 'shared', 'sharing']

export type FileRow = DriveItem & {
  /** Shared with me: who shared it, and when (ms). */
  sharedBy?: string
  sharedAt?: number
  /** Shared by me: who it's shared with ("Anyone with the link" for links). */
  sharedWith?: string[]
}

export type FilesData = {
  view: FilesView
  path: string
  /** The open folder (My files only). */
  folder: { path: string; name: string; permissions: string; mountType: string } | null
  items: FileRow[]
}

/** Nextcloud share permission bits → the WebDAV permission letters the UI checks. */
function letters(perms: number) {
  return 'GS' + (perms & 2 ? 'WN' : '') + (perms & 4 ? 'C' : '') + (perms & 8 ? 'D' : '') + (perms & 16 ? 'R' : '')
}

function shareRow(sh: Share, permissions: string): FileRow {
  return {
    id: sh.fileId,
    path: sh.path,
    name: sh.path.slice(sh.path.lastIndexOf('/') + 1),
    isDir: sh.isDir,
    size: sh.size,
    mtime: sh.mtime,
    mime: sh.mime,
    etag: '',
    favorite: false,
    hasPreview: sh.hasPreview,
    shareTypes: [],
    permissions,
    owner: sh.owner,
    ownerName: sh.ownerName,
    mountType: '',
  }
}

export async function loadFilesView(s: Session, view: FilesView, path: string): Promise<FilesData> {
  if (view === 'recent') return { view, path: '/', folder: null, items: await files.listRecent(s) }
  if (view === 'favorites') return { view, path: '/', folder: null, items: await files.listFavorites(s) }
  if (view === 'shared') {
    const shares = await files.sharedWithMe(s)
    const seen = new Set<number>()
    const items = shares
      .filter((sh) => !seen.has(sh.fileId) && seen.add(sh.fileId))
      .map((sh) => ({ ...shareRow(sh, letters(sh.permissions)), sharedBy: sh.ownerName, sharedAt: sh.sharedAt }))
      .filter((it) => !files.isHiddenItem(it))
    return { view, path: '/', folder: null, items: items.sort((a, b) => (b.sharedAt ?? 0) - (a.sharedAt ?? 0)) }
  }
  if (view === 'sharing') {
    const byFile = new Map<number, FileRow>()
    for (const sh of await files.sharedByMe(s)) {
      const row = byFile.get(sh.fileId) ?? { ...shareRow(sh, 'GWCDNVR'), sharedWith: [], sharedAt: sh.sharedAt }
      const who = sh.type === files.SHARE.link ? 'Anyone with the link' : sh.shareWithName
      if (!row.sharedWith!.includes(who)) row.sharedWith!.push(who)
      row.shareTypes = [...new Set([...row.shareTypes, sh.type])]
      row.sharedAt = Math.max(row.sharedAt ?? 0, sh.sharedAt)
      byFile.set(sh.fileId, row)
    }
    const items = [...byFile.values()].filter((it) => !files.isHiddenItem(it))
    return { view, path: '/', folder: null, items: items.sort((a, b) => (b.sharedAt ?? 0) - (a.sharedAt ?? 0)) }
  }
  const { folder, items } = await files.listFolder(s, path)
  return {
    view,
    path: folder.path,
    folder: { path: folder.path, name: folder.name, permissions: folder.permissions, mountType: folder.mountType },
    items,
  }
}
