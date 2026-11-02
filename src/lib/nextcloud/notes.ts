import 'server-only'
import type { Session } from '../session'
import { cleanPath, dav, davError, freeName, joinPath, parentOf, propfind, setFavorite, statItem, transfer, type DriveItem } from './files'
import { davPath, NextcloudError, ncRequest } from './http'

/**
 * Keep-style notes stored the way the Nextcloud Notes app stores them, so both
 * apps (and its phone apps) work on the same notes:
 * - one Markdown file per note in the Notes folder (`Notes/` unless the Notes
 *   app is set to another), named after the title; a titled note starts with
 *   `# Title`, an untitled one is just its text (named after its first line);
 * - pinned = the file's favourite star; archived = the `Archive` sub-folder;
 * - images in `.attachments.<fileId>/` next to the note (Nextcloud Text's convention);
 * - colour and labels (no Notes app equivalent) in `.avronext-notes.json`.
 */

export type NoteEntry = {
  id: number
  /** Full path in the user's files, e.g. "/Notes/Shopping.md". */
  path: string
  etag: string
  mtime: number
  favorite: boolean
  shareTypes: number[]
}

export type NoteMeta = { color?: string; labels?: string[] }
export type NotesMeta = { version: 1; labels: string[]; notes: Record<string, NoteMeta> }

const META_FILE = '.avronext-notes.json'

/** The file version from a GET: Nextcloud's OC-ETag (Apache adds "-gzip" to ETag on compressed responses). */
const etagOf = (res: Response) => (res.headers.get('oc-etag') ?? res.headers.get('etag') ?? '').replace(/"/g, '').replace(/-gzip$/, '')
export const ARCHIVE = 'Archive'
const NOTE_FILE = /\.(md|txt)$/i

/** The Notes folder: the Notes app's setting when it's installed, else "/Notes". */
export async function notesRoot(s: Session): Promise<string> {
  try {
    const res = await ncRequest(s, '/index.php/apps/notes/api/v1/settings', { headers: { Accept: 'application/json' } })
    if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
      const { notesPath } = (await res.json()) as { notesPath?: string }
      if (notesPath) return cleanPath(notesPath)
    }
  } catch {
    /* Notes app not installed */
  }
  return '/Notes'
}

const toEntry = (it: DriveItem): NoteEntry => ({ id: it.id, path: it.path, etag: it.etag, mtime: it.mtime, favorite: it.favorite, shareTypes: it.shareTypes })
const isNote = (it: DriveItem) => !it.isDir && NOTE_FILE.test(it.name) && !it.name.startsWith('.')

/** Every note in the Notes folder and its sub-folders (Archive and Notes-app categories), one level deep. */
export async function listNotes(s: Session, root: string): Promise<NoteEntry[]> {
  let items: DriveItem[]
  try {
    items = (await propfind(s, root, '1')).slice(1)
  } catch (err) {
    if (err instanceof NextcloudError && err.status === 404) {
      await dav(s, 'MKCOL', root)
      return []
    }
    throw err
  }
  const folders = items.filter((it) => it.isDir && !it.name.startsWith('.'))
  const nested = await Promise.all(folders.map((f) => propfind(s, f.path, '1').then((r) => r.slice(1)).catch(() => [] as DriveItem[])))
  return [...items, ...nested.flat()].filter(isNote).map(toEntry)
}

export async function readNote(s: Session, path: string): Promise<{ text: string; etag: string }> {
  const p = cleanPath(path)
  const res = await ncRequest(s, davPath(s.userId, p), { headers: { Accept: '*/*' } })
  if (!res.ok) throw davError(res.status, p, 'Loading the note')
  return { text: await res.text(), etag: etagOf(res) }
}

/** Runs `fn` over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

// ---- Content: "# Title\n\nbody" or just "body" ----

/** A file name from a title or first line: no path characters, at most 80 characters. */
export function noteFileName(title: string, body: string) {
  const firstLine = body
    .split('\n')
    .map((l) => l.replace(/^#+\s*|^\s*[-*] \[[ xX]\]\s*|!\[[^\]]*\]\([^)]*\)/g, '').trim())
    .find(Boolean)
  const base = (title.trim() || firstLine || 'Untitled note')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim()
  return base || 'Untitled note'
}

export function noteContent(title: string, body: string) {
  const t = title.replace(/\s+/g, ' ').trim()
  return t ? `# ${t}\n\n${body}` : body
}

/** Writes a note; returns its new etag. `ifMatch` guards edits, `create` refuses to overwrite. */
async function putNote(s: Session, path: string, text: string, guard: { ifMatch?: string; create?: boolean }) {
  const headers: Record<string, string> = { 'Content-Type': 'text/markdown; charset=utf-8' }
  if (guard.ifMatch) headers['If-Match'] = `"${guard.ifMatch}"`
  if (guard.create) headers['If-None-Match'] = '*'
  return ncRequest(s, davPath(s.userId, path), { method: 'PUT', raw: text, headers })
}

async function namesIn(s: Session, dir: string) {
  try {
    return new Set((await propfind(s, dir, '1')).slice(1).map((it) => it.name))
  } catch (err) {
    if (err instanceof NextcloudError && err.status === 404) {
      await dav(s, 'MKCOL', dir)
      return new Set<string>()
    }
    throw err
  }
}

export type SaveResult = { entry: NoteEntry } | { conflict: true; entry: NoteEntry; text: string }

/**
 * Creates (no `path`) or updates a note. An update is refused when the file
 * changed since `etag` (the caller keeps both versions); a new title renames the file.
 */
export async function saveNote(
  s: Session,
  root: string,
  data: { path?: string | null; etag?: string | null; title: string; body: string },
): Promise<SaveResult> {
  const text = noteContent(data.title, data.body)
  const wanted = noteFileName(data.title, data.body)
  if (!data.path) {
    const taken = await namesIn(s, root)
    for (let i = 0; i < 20; i++) {
      const path = joinPath(root, freeName(`${wanted}.md`, taken))
      const res = await putNote(s, path, text, { create: true })
      if (res.ok) return { entry: toEntry(await statItem(s, path)) }
      if (res.status !== 412) throw davError(res.status, path, 'Saving the note')
      taken.add(path.slice(path.lastIndexOf('/') + 1))
    }
    throw new NextcloudError('Could not find a free name for the note.', 409, root)
  }

  let path = cleanPath(data.path)
  const res = await putNote(s, path, text, { ifMatch: data.etag ?? undefined })
  if (res.status === 412 || res.status === 404) {
    // Changed (or removed) elsewhere: hand back the current version so the caller can keep both.
    if (res.status === 404) return saveNote(s, root, { ...data, path: null, etag: null })
    const current = await readNote(s, path)
    return { conflict: true, entry: toEntry(await statItem(s, path)), text: current.text }
  }
  if (!res.ok) throw davError(res.status, path, 'Saving the note')

  // Rename when the title (or first line) changed.
  const name = path.slice(path.lastIndexOf('/') + 1)
  const ext = name.match(NOTE_FILE)?.[0] ?? '.md'
  if (name.slice(0, -ext.length) !== wanted) {
    const dir = parentOf(path)
    const target = freeName(`${wanted}${ext}`, await namesIn(s, dir))
    if (target !== name) {
      const moved = await transfer(s, 'MOVE', path, joinPath(dir, target)).catch(() => null)
      if (moved) path = moved.path
    }
  }
  return { entry: toEntry(await statItem(s, path)) }
}

/** Moves a note (and its images folder) into or out of the Archive folder. */
export async function archiveNote(s: Session, root: string, path: string, archived: boolean): Promise<NoteEntry> {
  const p = cleanPath(path)
  const item = await statItem(s, p)
  const dir = archived ? joinPath(root, ARCHIVE) : root
  if (parentOf(p) === dir) return toEntry(item)
  const target = joinPath(dir, freeName(item.name, await namesIn(s, dir)))
  const moved = await transfer(s, 'MOVE', p, target)
  const attachments = `.attachments.${item.id}`
  await transfer(s, 'MOVE', joinPath(parentOf(p), attachments), joinPath(dir, attachments)).catch(() => null)
  return toEntry(moved)
}

export async function deleteNote(s: Session, path: string) {
  const p = cleanPath(path)
  const item = await statItem(s, p).catch(() => null)
  const res = await dav(s, 'DELETE', p)
  if (!res.ok && res.status !== 404) throw davError(res.status, p, 'Deleting the note')
  if (item) await dav(s, 'DELETE', joinPath(parentOf(p), `.attachments.${item.id}`)).catch(() => null)
}

export const pinNote = (s: Session, path: string, pinned: boolean) => setFavorite(s, path, pinned)

// ---- Colours and labels: one small JSON file, merged on every write ----

const emptyMeta = (): NotesMeta => ({ version: 1, labels: [], notes: {} })

export async function readMeta(s: Session, root: string): Promise<{ meta: NotesMeta; etag: string | null }> {
  const res = await ncRequest(s, davPath(s.userId, root, META_FILE), { headers: { Accept: '*/*' } })
  if (res.status === 404) return { meta: emptyMeta(), etag: null }
  if (!res.ok) throw davError(res.status, root, 'Loading note labels')
  try {
    const raw = (await res.json()) as Partial<NotesMeta>
    return {
      meta: {
        version: 1,
        labels: Array.isArray(raw.labels) ? raw.labels.filter((l) => typeof l === 'string') : [],
        notes: raw.notes && typeof raw.notes === 'object' ? raw.notes : {},
      },
      etag: etagOf(res),
    }
  } catch {
    return { meta: emptyMeta(), etag: etagOf(res) }
  }
}

/** Read-modify-write with If-Match, retried when another device wrote in between. */
export async function updateMeta(s: Session, root: string, change: (meta: NotesMeta) => void): Promise<NotesMeta> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { meta, etag } = await readMeta(s, root)
    change(meta)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (etag) headers['If-Match'] = `"${etag}"`
    else headers['If-None-Match'] = '*'
    const res = await ncRequest(s, davPath(s.userId, root, META_FILE), { method: 'PUT', raw: JSON.stringify(meta), headers })
    if (res.ok) return meta
    if (res.status === 404) await dav(s, 'MKCOL', root)
    else if (res.status !== 412) throw davError(res.status, root, 'Saving note labels')
  }
  throw new NextcloudError('Note labels are being changed elsewhere; try again.', 409, root)
}

// ---- Images ----

/** Stores an image next to the note (never overwriting); returns the Markdown-relative href. */
export async function uploadNoteImage(s: Session, notePath: string, name: string, body: BodyInit, length: string) {
  const note = await statItem(s, cleanPath(notePath))
  const dirName = `.attachments.${note.id}`
  const dir = joinPath(parentOf(note.path), dirName)
  // The body is a stream that can only be sent once, so pick a free name first.
  const candidate = freeName(name, await namesIn(s, dir))
  const res = await ncRequest(s, davPath(s.userId, dir, candidate), {
    method: 'PUT',
    raw: body,
    headers: { 'If-None-Match': '*', 'Content-Length': length, 'Content-Type': 'application/octet-stream' },
  })
  if (!res.ok) throw davError(res.status, dir, 'Uploading the image')
  return `${dirName}/${encodeURIComponent(candidate).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}
