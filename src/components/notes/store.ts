'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { archiveNote, deleteNote, editLabel, pinNote, saveNote, setNoteMeta, syncNotes } from '@/app/(app)/notes/actions'
import { isNoteColor, parseNote, type NoteColor, type SyncedNote, type SyncResult } from '@/lib/notesModel'

/**
 * Notes live in the user's Nextcloud (see lib/nextcloud/notes.ts). This store
 * keeps a copy in the browser (IndexedDB, per user) so the page opens at once,
 * applies edits immediately, saves them in the background and syncs with
 * Nextcloud on open, on tab focus, when back online and every 45 seconds.
 *
 * Unsaved changes are flags on the note itself (`dirty`), stored with it, so a
 * closed tab or a lost connection never loses them: they're sent next time.
 */

export type Note = {
  /** Stable local key ("n<fileId>" or "tmp-…" until first saved). */
  key: string
  id: number | null
  path: string | null
  etag: string | null
  title: string
  body: string
  pinned: boolean
  archived: boolean
  color: NoteColor
  labels: string[]
  mtime: number
  shareTypes: number[]
  /** Bumps on every local text edit. */
  rev: number
  dirty?: { content?: number; pin?: true; archive?: true; meta?: true; delete?: true }
}

export type NotesState = {
  /** Cached copy loaded (may be empty on first visit). */
  ready: boolean
  /** At least one sync with Nextcloud finished. */
  synced: boolean
  syncing: boolean
  offline: boolean
  error: string | null
  notes: Note[]
  labels: string[]
  root: string
}

type Snapshot = Pick<NotesState, 'notes' | 'labels' | 'root'>

// ---- IndexedDB: one record per user ----

const DB = 'avronext'
const STORE = 'notes'
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbGet(key: string): Promise<Snapshot | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as Snapshot | undefined)
    req.onerror = () => reject(req.error)
  })
}
async function idbPut(key: string, value: Snapshot) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

class Offline extends Error {}
/** Server actions throw (instead of returning ok: false) when the request never reached us. */
async function call<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>) {
  try {
    return await fn()
  } catch {
    throw new Offline()
  }
}

const isArchived = (path: string, root: string) => path.startsWith(`${root}/Archive/`)
let tmp = 0

export class NotesStore {
  state: NotesState = { ready: false, synced: false, syncing: false, offline: false, error: null, notes: [], labels: [], root: '/Notes' }
  private listeners = new Set<() => void>()
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private flushing: Promise<void> | null = null
  private flushAgain = false
  private syncing: Promise<void> | null = null
  private channel: BroadcastChannel | null = null
  private started = false

  constructor(private uid: string) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getState = () => this.state

  private set(patch: Partial<NotesState>, persist = false) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
    if (persist) this.schedulePersist()
  }
  private setNotes(fn: (notes: Note[]) => Note[]) {
    this.set({ notes: fn(this.state.notes) }, true)
  }
  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      const { notes, labels, root } = this.state
      idbPut(this.uid, { notes, labels, root }).catch(() => null)
    }, 250)
  }
  find = (key: string) => this.state.notes.find((n) => n.key === key)

  /** Load the browser copy, then keep in sync while the page is open. */
  start() {
    if (this.started) return
    this.started = true
    idbGet(this.uid)
      .catch(() => undefined)
      .then((snap) => {
        if (snap?.notes) this.set({ notes: snap.notes, labels: snap.labels ?? [], root: snap.root ?? '/Notes' })
        this.set({ ready: true })
        this.sync()
      })
    try {
      this.channel = new BroadcastChannel(`avronext-notes:${this.uid}`)
      this.channel.onmessage = () => this.sync(600)
    } catch {
      /* old browser */
    }
    setInterval(() => document.visibilityState === 'visible' && this.sync(), 45_000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.sync())
    window.addEventListener('online', () => this.sync())
    // Last chance to send pending edits when the tab closes.
    window.addEventListener('pagehide', () => this.state.notes.some((n) => n.dirty) && this.flush())
  }

  // ---- Sync ----

  sync(delay = 0): Promise<void> {
    if (delay) {
      setTimeout(() => this.sync(), delay)
      return Promise.resolve()
    }
    if (this.syncing) return this.syncing
    this.syncing = (async () => {
      await null
      this.set({ syncing: true })
      try {
        await this.flush()
        const known: Record<string, string> = {}
        for (const n of this.state.notes) if (n.id && n.etag) known[n.id] = n.etag
        const r = await call(() => syncNotes(known))
        if (!r.ok) return this.set({ error: r.error })
        this.merge(r.data)
        this.set({ synced: true, offline: false })
        if (this.state.notes.some((n) => n.dirty)) await this.flush()
      } catch (err) {
        if (err instanceof Offline) this.set({ offline: true })
      } finally {
        this.set({ syncing: false })
        this.syncing = null
      }
    })()
    return this.syncing
  }

  private fromServer(s: SyncedNote, data: SyncResult, prev?: Note): Note {
    const text = s.text
    const parsed = text !== undefined ? parseNote(text, s.path) : { title: prev?.title ?? '', body: prev?.body ?? '' }
    const meta = data.meta[String(s.id)] ?? {}
    return {
      key: prev?.key ?? `n${s.id}`,
      id: s.id,
      path: s.path,
      etag: s.etag,
      title: parsed.title,
      body: parsed.body,
      pinned: s.favorite,
      archived: isArchived(s.path, data.root),
      color: isNoteColor(meta.color) ? meta.color : 'default',
      labels: meta.labels ?? [],
      mtime: s.mtime,
      shareTypes: s.shareTypes,
      rev: prev?.rev ?? 0,
    }
  }

  private merge(data: SyncResult) {
    const server = new Map(data.notes.map((n) => [n.id, n]))
    const next: Note[] = []
    for (const local of this.state.notes) {
      if (local.id === null) {
        next.push(local)
        continue
      }
      const s = server.get(local.id)
      server.delete(local.id)
      if (!s) {
        // Gone in Nextcloud: keep it only if there are unsaved edits (it's re-created).
        if (local.dirty?.content !== undefined && !local.dirty.delete) next.push({ ...local, id: null, path: null, etag: null })
        continue
      }
      if (local.dirty) {
        next.push({ ...local, path: local.dirty.archive ? local.path : s.path, shareTypes: s.shareTypes })
        continue
      }
      next.push(this.fromServer(s, data, local))
    }
    for (const s of server.values()) next.push(this.fromServer(s, data))
    this.set({ notes: next, labels: data.labels, root: data.root }, true)
  }

  // ---- Background saving ----

  scheduleFlush(delay = 900) {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => this.flush().catch(() => null), delay)
  }

  flush(): Promise<void> {
    if (this.flushing) {
      this.flushAgain = true
      return this.flushing
    }
    this.flushing = (async () => {
      // Yield first: with nothing to send this would otherwise finish (and clear
      // `flushing`) before the assignment below, leaving it stuck "in progress".
      await null
      let changed = false
      try {
        do {
          this.flushAgain = false
          for (const n of this.state.notes.filter((x) => x.dirty)) changed = (await this.flushNote(n.key)) || changed
        } while (this.flushAgain)
        if (this.state.offline) this.set({ offline: false })
      } catch (err) {
        if (!(err instanceof Offline)) throw err
        this.set({ offline: true })
        if (this.retryTimer) clearTimeout(this.retryTimer)
        this.retryTimer = setTimeout(() => this.sync(), 15_000)
      } finally {
        this.flushing = null
        if (changed) this.channel?.postMessage('changed')
      }
    })()
    return this.flushing
  }

  private patch(key: string, fn: (n: Note) => Note) {
    this.setNotes((ns) => ns.map((n) => (n.key === key ? fn(n) : n)))
  }
  private clear(key: string, flag: keyof NonNullable<Note['dirty']>) {
    this.patch(key, (n) => {
      if (!n.dirty) return n
      const d = { ...n.dirty }
      delete d[flag]
      return { ...n, dirty: Object.keys(d).length ? d : undefined }
    })
  }
  private fail(error: string) {
    this.set({ error })
  }

  /** Sends one note's pending changes; returns whether anything was written. */
  private async flushNote(key: string): Promise<boolean> {
    let n = this.find(key)
    if (!n?.dirty) return false

    if (n.dirty.delete) {
      if (n.path) {
        const r = await call(() => deleteNote(n!.path!, n!.id))
        if (!r.ok) this.fail(r.error)
      }
      this.setNotes((ns) => ns.filter((x) => x.key !== key))
      return true
    }

    if (n.dirty.content !== undefined || n.id === null) {
      const rev = n.rev
      const r = await call(() => saveNote({ path: n!.path, etag: n!.etag, title: n!.title, body: n!.body }))
      if (!r.ok) {
        this.fail(r.error)
        this.clear(key, 'content')
        return false
      }
      if ('conflict' in r.data) {
        // Changed on another device too: keep both.
        const mine = this.find(key)!
        const theirs = parseNote(r.data.text, r.data.entry.path)
        const copy: Note = {
          ...mine,
          key: `tmp-${Date.now()}-${++tmp}`,
          id: null,
          path: null,
          etag: null,
          title: `${mine.title || 'Note'} (conflict)`,
          pinned: false,
          archived: false,
          dirty: { content: mine.rev, meta: true },
        }
        this.setNotes((ns) => [
          ...ns.map((x) =>
            x.key === key
              ? { ...x, ...theirs, path: r.data.entry.path, etag: r.data.entry.etag, mtime: r.data.entry.mtime, dirty: x.dirty?.meta ? { meta: true as const } : undefined }
              : x,
          ),
          copy,
        ])
        this.flushAgain = true // the copy still has to be saved
        return true
      }
      const e = r.data.entry
      this.patch(key, (x) => {
        const d = { ...x.dirty }
        if (x.rev === rev) delete d.content
        return { ...x, id: e.id, path: e.path, etag: e.etag, mtime: e.mtime, shareTypes: e.shareTypes, dirty: Object.keys(d).length ? d : undefined }
      })
      // A brand-new note pinned/archived/coloured before its first save: carry on with those.
      n = this.find(key)
      if (!n?.dirty) return true
    }

    if (n.dirty?.archive && n.path) {
      const want = n.archived
      const r = await call(() => archiveNote(n!.path!, want))
      if (!r.ok) this.fail(r.error)
      else this.patch(key, (x) => ({ ...x, path: r.data.path, etag: r.data.etag }))
      this.clear(key, 'archive')
      n = this.find(key)
    }
    if (n?.dirty?.pin && n.path) {
      const want = n.pinned
      const r = await call(() => pinNote(n!.path!, want))
      if (!r.ok) this.fail(r.error)
      this.clear(key, 'pin')
      n = this.find(key)
    }
    if (n?.dirty?.meta && n.id) {
      const r = await call(() => setNoteMeta(n!.id!, { color: n!.color, labels: n!.labels }))
      if (!r.ok) this.fail(r.error)
      this.clear(key, 'meta')
    }
    return true
  }

  // ---- Edits (applied at once, saved in the background) ----

  create(data: Partial<Pick<Note, 'title' | 'body' | 'color' | 'labels' | 'pinned' | 'archived'>>): string {
    const key = `tmp-${Date.now()}-${++tmp}`
    const note: Note = {
      key,
      id: null,
      path: null,
      etag: null,
      title: data.title ?? '',
      body: data.body ?? '',
      pinned: data.pinned ?? false,
      archived: false,
      color: data.color ?? 'default',
      labels: data.labels ?? [],
      mtime: Date.now(),
      shareTypes: [],
      rev: 1,
      dirty: {
        content: 1,
        ...(data.pinned ? { pin: true as const } : {}),
        ...((data.color && data.color !== 'default') || data.labels?.length ? { meta: true as const } : {}),
      },
    }
    this.setNotes((ns) => [note, ...ns])
    this.scheduleFlush(300)
    return key
  }

  edit(key: string, data: { title?: string; body?: string }) {
    this.patch(key, (n) => {
      const rev = n.rev + 1
      return { ...n, ...data, rev, mtime: Date.now(), dirty: { ...n.dirty, content: rev } }
    })
    this.scheduleFlush()
  }

  private flag(key: string, data: Partial<Note>, ...flags: ('pin' | 'archive' | 'meta' | 'delete')[]) {
    this.patch(key, (n) => ({ ...n, ...data, dirty: { ...n.dirty, ...Object.fromEntries(flags.map((f) => [f, true])) } }))
    this.scheduleFlush(200)
  }
  /** Like Keep: pinning an archived note brings it back; archiving unpins. */
  setPinned = (key: string, pinned: boolean) => {
    const n = this.find(key)
    if (pinned && n?.archived) this.flag(key, { pinned, archived: false }, 'pin', 'archive')
    else this.flag(key, { pinned }, 'pin')
  }
  setArchived = (key: string, archived: boolean) => {
    const n = this.find(key)
    if (archived && n?.pinned) this.flag(key, { archived, pinned: false }, 'archive', 'pin')
    else this.flag(key, { archived }, 'archive')
  }
  setColor = (key: string, color: NoteColor) => this.flag(key, { color }, 'meta')
  setLabels = (key: string, labels: string[]) => this.flag(key, { labels }, 'meta')
  remove = (key: string) => {
    const n = this.find(key)
    if (!n) return
    if (!n.id && !n.path) this.setNotes((ns) => ns.filter((x) => x.key !== key))
    else this.flag(key, {}, 'delete')
  }

  /** Adds / renames / deletes a label everywhere. */
  async editLabel(from: string | null, to: string | null) {
    const r = await call(() => editLabel(from, to)).catch(() => null)
    if (!r) return 'You’re offline; try again when you’re connected.'
    if (!r.ok) return r.error
    this.set({ labels: r.data }, true)
    if (from)
      this.setNotes((ns) =>
        ns.map((n) => (n.labels.includes(from) ? { ...n, labels: [...new Set(n.labels.flatMap((l) => (l === from ? (to ? [to] : []) : [l])))] } : n)),
      )
    return null
  }

  /** Saves a new note first if needed, so images have a file to sit next to. */
  async ensureSaved(key: string): Promise<Note | null> {
    for (let i = 0; i < 3; i++) {
      const n = this.find(key)
      if (!n) return null
      if (n.path && n.dirty?.content === undefined) return n
      await this.flush()
    }
    return this.find(key)?.path ? this.find(key)! : null
  }

  dismissError = () => this.set({ error: null })
}

const stores = new Map<string, NotesStore>()
export function notesStore(uid: string) {
  let s = stores.get(uid)
  if (!s) stores.set(uid, (s = new NotesStore(uid)))
  return s
}

const SERVER_STATE: NotesState = { ready: false, synced: false, syncing: false, offline: false, error: null, notes: [], labels: [], root: '/Notes' }

export function useNotes(uid: string) {
  const store = notesStore(uid)
  const state = useSyncExternalStore(store.subscribe, store.getState, () => SERVER_STATE)
  useEffect(() => store.start(), [store])
  return { state, store }
}
