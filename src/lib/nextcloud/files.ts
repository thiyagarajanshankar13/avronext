import 'server-only'
import { XMLParser } from 'fast-xml-parser'
import { nextcloudUrl } from '../env'
import type { Session } from '../session'
import { davPath, NextcloudError, ncRequest, ocs } from './http'

/**
 * The signed-in user's Nextcloud files (WebDAV) and sharing (OCS Share API).
 * Paths are relative to the user's root: "/" or "/Documents/Report.pdf".
 */

export type DriveItem = {
  id: number
  path: string
  name: string
  isDir: boolean
  /** Bytes (folders: total size). */
  size: number
  /** Last modified, ms. */
  mtime: number
  mime: string
  etag: string
  favorite: boolean
  hasPreview: boolean
  /** Nextcloud share types set on this item by the user (0 user, 1 group, 3 link, 4 email, 7 team). */
  shareTypes: number[]
  /** Nextcloud permission letters: G read, W write, C create, D delete, N rename, V move, R share, S shared with me. */
  permissions: string
  owner: string
  ownerName: string
  /** "shared", "group", "collective"… or "" for the user's own storage. */
  mountType: string
}

/** The folder Collectives keeps its pages in: Spaces covers it, Files hides it. */
const HIDDEN_MOUNTS = new Set(['collectives-user', 'collective'])

export const isHiddenItem = (it: Pick<DriveItem, 'name' | 'mountType' | 'path'>) =>
  HIDDEN_MOUNTS.has(it.mountType) || it.path.split('/').some((p) => p.startsWith('.'))

/** "/a/b" from any user input; rejects "." and ".." segments. */
export function cleanPath(input: string): string {
  const parts = String(input ?? '')
    .split('/')
    .filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..' || /[\u0000-\u001f]/.test(p))) throw new NextcloudError('Invalid path.', 400, input)
  return '/' + parts.join('/')
}

export function parentOf(path: string) {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}

export const joinPath = (dir: string, name: string) => (dir === '/' ? '' : dir) + '/' + name

/** A single file/folder name the user typed. */
export function checkName(name: string): string {
  const n = String(name ?? '').trim()
  if (!n) throw new NextcloudError('Enter a name.', 400, name)
  if (n === '.' || n === '..' || /[/\\\u0000-\u001f]/.test(n)) throw new NextcloudError('Names can’t contain / or \\.', 400, name)
  if (n.length > 250) throw new NextcloudError('That name is too long.', 400, name)
  return n
}

// ---- WebDAV ----

const PROPS = `<d:getlastmodified/><d:getcontentlength/><d:getcontenttype/><d:getetag/><d:resourcetype/>
<oc:fileid/><oc:size/><oc:permissions/><oc:favorite/><oc:share-types/><oc:owner-id/><oc:owner-display-name/>
<nc:has-preview/><nc:mount-type/>`
const NS = 'xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"'

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (name) => ['response', 'propstat', 'share-type'].includes(name),
})

type Prop = Record<string, unknown>

function parseMultistatus(xml: string, userId: string): DriveItem[] {
  const doc = parser.parse(xml) as { multistatus?: { response?: { href: string; propstat: { prop: Prop; status: string }[] }[] } }
  const marker = `/remote.php/dav/files/${userId}`
  return (doc.multistatus?.response ?? []).map((r) => {
    const prop: Prop = Object.assign({}, ...r.propstat.filter((p) => String(p.status).includes(' 200 ')).map((p) => p.prop))
    const href = decodeURIComponent(r.href)
    const at = href.indexOf(marker)
    const path = '/' + (at >= 0 ? href.slice(at + marker.length) : href).split('/').filter(Boolean).join('/')
    const isDir = typeof prop.resourcetype === 'object' && prop.resourcetype !== null && 'collection' in prop.resourcetype
    const shares = (prop['share-types'] as { 'share-type'?: string[] } | '' | undefined) || {}
    return {
      id: Number(prop.fileid) || 0,
      path,
      name: path === '/' ? '' : path.slice(path.lastIndexOf('/') + 1),
      isDir,
      size: Number(isDir ? prop.size : (prop.getcontentlength ?? prop.size)) || 0,
      mtime: Date.parse(String(prop.getlastmodified ?? '')) || 0,
      mime: isDir ? 'httpd/unix-directory' : String(prop.getcontenttype || 'application/octet-stream'),
      etag: String(prop.getetag ?? '').replace(/"/g, ''),
      favorite: String(prop.favorite) === '1',
      hasPreview: String(prop['has-preview']) === 'true',
      shareTypes: (shares['share-type'] ?? []).map(Number),
      permissions: String(prop.permissions ?? ''),
      owner: String(prop['owner-id'] ?? ''),
      ownerName: String(prop['owner-display-name'] ?? ''),
      mountType: String(prop['mount-type'] ?? ''),
    }
  })
}

async function dav(s: Session, method: string, path: string, opts: { body?: string; headers?: Record<string, string>; root?: string } = {}) {
  const url = opts.root ?? davPath(s.userId, path)
  return ncRequest(s, url, {
    method,
    raw: opts.body,
    headers: { Accept: 'application/xml, */*', ...(opts.body ? { 'Content-Type': 'application/xml; charset=utf-8' } : {}), ...opts.headers },
  })
}

function davError(status: number, path: string, what: string): NextcloudError {
  const msg =
    status === 404
      ? 'That file or folder no longer exists.'
      : status === 403
        ? 'You don’t have permission to do that.'
        : status === 412 || status === 405
          ? 'Something with that name already exists here.'
          : status === 423
            ? 'That file is locked (it’s being edited somewhere else).'
            : status === 507
              ? 'There isn’t enough storage space.'
              : `${what} failed (Nextcloud returned ${status}).`
  return new NextcloudError(msg, status, path)
}

async function propfind(s: Session, path: string, depth: '0' | '1') {
  const res = await dav(s, 'PROPFIND', path, { body: `<?xml version="1.0"?><d:propfind ${NS}><d:prop>${PROPS}</d:prop></d:propfind>`, headers: { Depth: depth } })
  if (res.status !== 207) throw davError(res.status, path, 'Loading')
  return parseMultistatus(await res.text(), s.userId)
}

export async function statItem(s: Session, path: string): Promise<DriveItem> {
  const [item] = await propfind(s, cleanPath(path), '0')
  return item
}

/** A folder and its visible children (no dot-files, no Collectives folder). */
export async function listFolder(s: Session, path: string): Promise<{ folder: DriveItem; items: DriveItem[] }> {
  const p = cleanPath(path)
  const [folder, ...items] = await propfind(s, p, '1')
  return { folder, items: items.filter((it) => !isHiddenItem(it)) }
}

/** Sub-folders only (the Move/Copy folder picker). */
export async function listSubfolders(s: Session, path: string) {
  const { folder, items } = await listFolder(s, path)
  return { folder, folders: items.filter((it) => it.isDir) }
}

export async function listFavorites(s: Session): Promise<DriveItem[]> {
  const body = `<?xml version="1.0"?><oc:filter-files ${NS}><d:prop>${PROPS}</d:prop><oc:filter-rules><oc:favorite>1</oc:favorite></oc:filter-rules></oc:filter-files>`
  const res = await dav(s, 'REPORT', '/', { body })
  if (res.status !== 207) throw davError(res.status, '/', 'Loading favourites')
  return parseMultistatus(await res.text(), s.userId).filter((it) => it.path !== '/' && !isHiddenItem(it))
}

/** Most recently modified files anywhere in the user's storage. */
export async function listRecent(s: Session, limit = 60): Promise<DriveItem[]> {
  const body = `<?xml version="1.0"?><d:searchrequest ${NS}><d:basicsearch>
<d:select><d:prop>${PROPS}</d:prop></d:select>
<d:from><d:scope><d:href>/files/${s.userId}</d:href><d:depth>infinity</d:depth></d:scope></d:from>
<d:where><d:not><d:is-collection/></d:not></d:where>
<d:orderby><d:order><d:prop><d:getlastmodified/></d:prop><d:descending/></d:order></d:orderby>
<d:limit><d:nresults>${limit * 3}</d:nresults></d:limit></d:basicsearch></d:searchrequest>`
  const res = await dav(s, 'SEARCH', '/', { body, root: '/remote.php/dav/', headers: { 'Content-Type': 'text/xml' } })
  if (res.status !== 207) throw davError(res.status, '/', 'Loading recent files')
  return parseMultistatus(await res.text(), s.userId)
    .filter((it) => !it.isDir && !isHiddenItem(it))
    .slice(0, limit)
}

export async function createFolder(s: Session, parent: string, name: string): Promise<DriveItem> {
  const path = joinPath(cleanPath(parent), checkName(name))
  const res = await dav(s, 'MKCOL', path)
  if (!res.ok) throw davError(res.status, path, 'Creating the folder')
  return statItem(s, path)
}

/** Creates each folder (parents first) unless it exists: for folder uploads. */
export async function ensureFolders(s: Session, base: string, relDirs: string[]) {
  const root = cleanPath(base)
  const all = new Set<string>()
  for (const rel of relDirs) {
    const parts = cleanPath(rel).split('/').filter(Boolean)
    for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join('/'))
  }
  for (const rel of [...all].sort((a, b) => a.split('/').length - b.split('/').length)) {
    const path = joinPath(root, rel)
    const res = await dav(s, 'MKCOL', path)
    if (!res.ok && res.status !== 405) throw davError(res.status, path, 'Creating the folder')
  }
}

/** MOVE or COPY; refuses to overwrite unless asked. */
export async function transfer(s: Session, op: 'MOVE' | 'COPY', from: string, to: string, overwrite = false): Promise<DriveItem> {
  const src = cleanPath(from)
  const dest = cleanPath(to)
  if (src === '/' || dest === '/') throw new NextcloudError('You can’t move your whole drive.', 400, src)
  if (dest === src || dest.startsWith(src + '/')) throw new NextcloudError('A folder can’t go inside itself.', 400, src)
  const res = await dav(s, op, src, { headers: { Destination: nextcloudUrl() + davPath(s.userId, dest), Overwrite: overwrite ? 'T' : 'F' } })
  if (!res.ok) throw davError(res.status, src, op === 'MOVE' ? 'Moving' : 'Copying')
  return statItem(s, dest)
}

export async function deleteItem(s: Session, path: string) {
  const p = cleanPath(path)
  if (p === '/') throw new NextcloudError('You can’t delete your whole drive.', 400, p)
  const res = await dav(s, 'DELETE', p)
  if (!res.ok && res.status !== 404) throw davError(res.status, p, 'Deleting')
}

export async function setFavorite(s: Session, path: string, favorite: boolean) {
  const p = cleanPath(path)
  const body = `<?xml version="1.0"?><d:propertyupdate ${NS}><d:set><d:prop><oc:favorite>${favorite ? 1 : 0}</oc:favorite></d:prop></d:set></d:propertyupdate>`
  const res = await dav(s, 'PROPPATCH', p, { body })
  if (res.status !== 207) throw davError(res.status, p, 'Saving the favourite')
}

/** First free "name (2).ext" in a folder whose names are `taken`. */
export function freeName(name: string, taken: Set<string>) {
  if (!taken.has(name)) return name
  const dot = name.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let n = 2; ; n++) if (!taken.has(`${stem} (${n})${ext}`)) return `${stem} (${n})${ext}`
}

// ---- Uploads (used by the /api/upload route) ----

/** Single PUT; `If-None-Match: *` makes Nextcloud refuse to replace an existing file. */
export async function putFile(s: Session, path: string, body: BodyInit, length: string, overwrite: boolean) {
  const p = cleanPath(path)
  const res = await ncRequest(s, davPath(s.userId, p), {
    method: 'PUT',
    raw: body,
    headers: { 'Content-Length': length, 'Content-Type': 'application/octet-stream', ...(overwrite ? {} : { 'If-None-Match': '*' }) },
  })
  if (!res.ok) throw davError(res.status, p, 'Uploading')
  return statItem(s, p)
}

// Chunked upload v2: MKCOL uploads/<user>/<id>, PUT …/<n> (5 MB+ each but the last), MOVE …/.file.
const uploadDir = (s: Session, id: string) => `/remote.php/dav/uploads/${encodeURIComponent(s.userId)}/${encodeURIComponent(id)}`
const destination = (s: Session, path: string) => nextcloudUrl() + davPath(s.userId, cleanPath(path))

export async function startChunked(s: Session, id: string, path: string) {
  const res = await dav(s, 'MKCOL', '', { root: uploadDir(s, id), headers: { Destination: destination(s, path) } })
  if (!res.ok) throw davError(res.status, path, 'Starting the upload')
}

export async function putChunk(s: Session, id: string, n: number, path: string, body: BodyInit, length: string) {
  const res = await ncRequest(s, `${uploadDir(s, id)}/${n}`, {
    method: 'PUT',
    raw: body,
    headers: { 'Content-Length': length, 'Content-Type': 'application/octet-stream', Destination: destination(s, path) },
  })
  if (!res.ok) throw davError(res.status, path, 'Uploading')
}

export async function finishChunked(s: Session, id: string, path: string, total: number, overwrite: boolean) {
  const res = await dav(s, 'MOVE', '', {
    root: `${uploadDir(s, id)}/.file`,
    headers: { Destination: destination(s, path), 'OC-Total-Length': String(total), Overwrite: overwrite ? 'T' : 'F' },
  })
  if (!res.ok) throw davError(res.status, path, 'Finishing the upload')
  return statItem(s, path)
}

export async function abortChunked(s: Session, id: string) {
  await dav(s, 'DELETE', '', { root: uploadDir(s, id) }).catch(() => null)
}

// ---- Sharing (OCS files_sharing) ----

export const SHARE = { user: 0, group: 1, link: 3, email: 4, team: 7 } as const
const PEOPLE_TYPES: number[] = [SHARE.user, SHARE.group, SHARE.team]
const LISTED_TYPES: number[] = [...PEOPLE_TYPES, SHARE.link, SHARE.email]

type RawShare = {
  id: string
  share_type: number
  share_with: string | null
  share_with_displayname: string | null
  permissions: number
  url?: string
  token: string | null
  expiration: string | null
  password?: string | null
  label?: string | null
  path: string
  item_type: 'file' | 'folder'
  mimetype: string
  file_source: number
  file_target: string
  item_size?: number
  item_mtime?: number
  has_preview?: boolean
  uid_owner: string
  displayname_owner: string
  uid_file_owner?: string
  displayname_file_owner?: string
  stime: number
}

export type Share = {
  id: string
  type: number
  shareWith: string
  shareWithName: string
  permissions: number
  url: string | null
  expiration: string | null
  hasPassword: boolean
  label: string
  /** Path in the owner's storage (shared by me) or the recipient's (shared with me). */
  path: string
  isDir: boolean
  mime: string
  fileId: number
  size: number
  /** ms */
  mtime: number
  sharedAt: number
  hasPreview: boolean
  owner: string
  ownerName: string
}

function toShare(r: RawShare, withMe = false): Share {
  return {
    id: String(r.id),
    type: r.share_type,
    shareWith: r.share_with ?? '',
    shareWithName: r.share_with_displayname || r.share_with || '',
    permissions: r.permissions,
    url: r.url ?? null,
    expiration: r.expiration ? r.expiration.slice(0, 10) : null,
    hasPassword: Boolean(r.password),
    label: r.label ?? '',
    path: withMe ? r.file_target : r.path,
    isDir: r.item_type === 'folder',
    mime: r.item_type === 'folder' ? 'httpd/unix-directory' : r.mimetype,
    fileId: r.file_source,
    size: r.item_size ?? 0,
    mtime: (r.item_mtime ?? r.stime) * 1000,
    sharedAt: r.stime * 1000,
    hasPreview: Boolean(r.has_preview),
    owner: r.uid_file_owner || r.uid_owner,
    ownerName: r.displayname_file_owner || r.displayname_owner,
  }
}

const SHARES = '/apps/files_sharing/api/v1/shares'

/** Shares on one item (people and links), including other people's reshares. */
export async function sharesFor(s: Session, path: string): Promise<Share[]> {
  const raw = await ocs<RawShare[]>(s, `${SHARES}?${new URLSearchParams({ path: cleanPath(path), reshares: 'true' })}`)
  return raw.filter((r) => LISTED_TYPES.includes(r.share_type)).map((r) => toShare(r))
}

export async function sharedByMe(s: Session): Promise<Share[]> {
  const raw = await ocs<RawShare[]>(s, SHARES)
  return raw.filter((r) => LISTED_TYPES.includes(r.share_type)).map((r) => toShare(r))
}

export async function sharedWithMe(s: Session): Promise<Share[]> {
  const raw = await ocs<RawShare[]>(s, `${SHARES}?shared_with_me=true`)
  return raw.filter((r) => PEOPLE_TYPES.includes(r.share_type)).map((r) => toShare(r, true))
}

export async function createShare(
  s: Session,
  data: { path: string; type: number; shareWith?: string; permissions?: number; password?: string; expireDate?: string },
): Promise<Share> {
  const body: Record<string, unknown> = { path: cleanPath(data.path), shareType: data.type }
  if (data.shareWith) body.shareWith = data.shareWith
  if (data.permissions) body.permissions = data.permissions
  if (data.password) body.password = data.password
  if (data.expireDate) body.expireDate = data.expireDate
  return toShare(await ocs<RawShare>(s, SHARES, { method: 'POST', body }))
}

export async function updateShare(s: Session, id: string, data: { permissions?: number; password?: string; expireDate?: string; label?: string }) {
  const body: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) if (v !== undefined) body[k] = v
  return toShare(await ocs<RawShare>(s, `${SHARES}/${encodeURIComponent(id)}`, { method: 'PUT', body }))
}

export async function deleteShare(s: Session, id: string) {
  await ocs<unknown>(s, `${SHARES}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Download a folder or several items of one folder as a zip (Nextcloud 30+ builds it). */
export async function zipResponse(s: Session, dir: string, names: string[]) {
  const p = cleanPath(dir)
  const qs = names.length ? `?${new URLSearchParams({ files: JSON.stringify(names.map(checkName)) })}` : ''
  const res = await ncRequest(s, davPath(s.userId, p) + qs, { headers: { Accept: 'application/zip' } })
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('zip')) throw davError(res.status, p, 'Preparing the download')
  return res
}
