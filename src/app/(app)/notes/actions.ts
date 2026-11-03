'use server'

import { run } from '@/lib/actions'
import * as notes from '@/lib/nextcloud/notes'
import { isNoteColor, type SyncResult } from '@/lib/notesModel'

const cleanLabel = (l: unknown) => String(l ?? '').replace(/\s+/g, ' ').trim().slice(0, 50)

/**
 * One background sync: every note's version, plus the text of the notes whose
 * version the browser doesn't have (`known`: id → etag).
 */
export async function syncNotes(known: Record<string, string>) {
  return run<SyncResult>(async (s) => {
    const root = await notes.notesRoot(s)
    const [entries, { meta }] = await Promise.all([notes.listNotes(s, root), notes.readMeta(s, root)])
    const withText = await notes.mapLimit(entries, 6, async (e) => {
      if (known?.[e.id] === e.etag) return e
      const { text } = await notes.readNote(s, e.path).catch(() => ({ text: '' }))
      return { ...e, text }
    })
    const used = new Set(Object.values(meta.notes).flatMap((m) => m.labels ?? []))
    return { root, notes: withText, labels: [...new Set([...meta.labels, ...used])], meta: meta.notes }
  })
}

export async function saveNote(data: { path: string | null; etag: string | null; title: string; body: string }) {
  return run(async (s) => {
    const root = await notes.notesRoot(s)
    return notes.saveNote(s, root, {
      path: data.path,
      etag: data.etag,
      title: String(data.title ?? '').slice(0, 500),
      body: String(data.body ?? '').slice(0, 1_000_000),
    })
  })
}

export async function pinNote(path: string, pinned: boolean) {
  return run((s) => notes.pinNote(s, path, Boolean(pinned)))
}

export async function archiveNote(path: string, archived: boolean) {
  return run(async (s) => notes.archiveNote(s, await notes.notesRoot(s), path, Boolean(archived)))
}

export async function deleteNote(path: string, id: number | null) {
  return run(async (s) => {
    await notes.deleteNote(s, path)
    // Forget its colour and labels too.
    if (id) await notes.updateMeta(s, await notes.notesRoot(s), (meta) => void delete meta.notes[String(id)]).catch(() => null)
    return null
  })
}

/** Colour and labels of one note (by file id). */
export async function setNoteMeta(id: number, data: { color: string; labels: string[] }) {
  return run(async (s) => {
    const root = await notes.notesRoot(s)
    const labels = [...new Set((data.labels ?? []).map(cleanLabel).filter(Boolean))].slice(0, 30)
    await notes.updateMeta(s, root, (meta) => {
      const entry = { ...(isNoteColor(data.color) && data.color !== 'default' ? { color: data.color } : {}), ...(labels.length ? { labels } : {}) }
      if (Object.keys(entry).length) meta.notes[String(id)] = entry
      else delete meta.notes[String(id)]
      meta.labels = [...new Set([...meta.labels, ...labels])]
    })
    return null
  })
}

/** Add, rename (`from` → `to`) or delete (`to` = null) a label everywhere. */
export async function editLabel(from: string | null, to: string | null) {
  return run(async (s) => {
    const root = await notes.notesRoot(s)
    const a = from ? cleanLabel(from) : null
    const b = to ? cleanLabel(to) : null
    const meta = await notes.updateMeta(s, root, (meta) => {
      const rename = (list: string[]) => [...new Set(list.flatMap((l) => (l === a ? (b ? [b] : []) : [l])))]
      if (!a) {
        if (b && !meta.labels.includes(b)) meta.labels.push(b)
        return
      }
      meta.labels = rename(meta.labels)
      for (const [id, m] of Object.entries(meta.notes)) {
        if (!m.labels?.includes(a)) continue
        m.labels = rename(m.labels)
        if (!m.labels.length) delete m.labels
        if (!Object.keys(m).length) delete meta.notes[id]
      }
    })
    return meta.labels
  })
}
