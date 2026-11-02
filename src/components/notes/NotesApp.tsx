'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FileRow } from '@/app/(app)/files/data'
import { fmtRelative } from '@/lib/format'
import { splitBody } from '@/lib/notesModel'
import { ShareDialog } from '../files/ShareDialog'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import { NoteCard } from './NoteCard'
import { NoteFields } from './NoteFields'
import { addImages, NoteToolbar, useImagePicker } from './NoteTools'
import { useNotes, type Note, type NotesStore } from './store'

type View = { kind: 'notes' } | { kind: 'archive' } | { kind: 'label'; label: string }

/** Keep-style notes: sidebar (Notes, labels, Archive), composer, pinned/other grids, editor. */
export function NotesApp({ uid }: { uid: string }) {
  const { state, store } = useNotes(uid)
  const params = useSearchParams()
  const view: View = params.get('view') === 'archive' ? { kind: 'archive' } : params.get('label') ? { kind: 'label', label: params.get('label')! } : { kind: 'notes' }
  const [q, setQ] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [sharing, setSharing] = useState<Note | null>(null)
  const [editingLabels, setEditingLabels] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const imageFor = useRef<string | null>(null)
  const picker = useImagePicker((files) => imageFor.current && addImages(store, imageFor.current, files, setToast))
  const pickImages = (key: string) => {
    imageFor.current = key
    picker.open()
  }

  useEffect(() => {
    if (state.error) {
      setToast(state.error)
      store.dismissError()
    }
  }, [state.error, store])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => setSidebarOpen(false), [params])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return state.notes
      .filter((n) => !n.dirty?.delete)
      .filter((n) => (view.kind === 'archive' ? n.archived : !n.archived))
      .filter((n) => (view.kind === 'label' ? n.labels.includes(view.label) : true))
      .filter((n) => !needle || `${n.title}\n${n.body}\n${n.labels.join(' ')}`.toLowerCase().includes(needle))
      .sort((a, b) => b.mtime - a.mtime)
  }, [state.notes, view.kind, view.kind === 'label' ? view.label : '', q]) // eslint-disable-line react-hooks/exhaustive-deps

  const pinned = view.kind === 'archive' ? [] : visible.filter((n) => n.pinned)
  const others = view.kind === 'archive' ? visible : visible.filter((n) => !n.pinned)
  const openNote = openKey ? state.notes.find((n) => n.key === openKey && !n.dirty?.delete) : null
  const loading = !state.ready || (!state.synced && state.notes.length === 0 && !state.offline)

  const card = (n: Note) => (
    <NoteCard
      key={n.key}
      note={n}
      store={store}
      labels={state.labels}
      onOpen={() => setOpenKey(n.key)}
      onShare={() => setSharing(n)}
      onImages={() => pickImages(n.key)}
      onError={setToast}
      onLabel={(l) => window.history.pushState(null, '', `/notes?label=${encodeURIComponent(l)}`)}
    />
  )

  const sideLink = (href: string, icon: Parameters<typeof Icon>[0]['name'], label: string, active: boolean) => (
    <Link prefetch={false} href={href} className={`side-link${active ? ' is-active' : ''}`}>
      <Icon name={icon} /> <span className="side-label-title">{label}</span>
    </Link>
  )

  return (
    <div className="with-sidebar">
      <aside className={`sidebar${sidebarOpen ? ' is-open' : ''}`}>
        <button className="sidebar-toggle" onClick={() => setSidebarOpen((o) => !o)} aria-expanded={sidebarOpen}>
          <Icon name="menu" /> {view.kind === 'archive' ? 'Archive' : view.kind === 'label' ? view.label : 'Notes'}
        </button>
        <div className="sidebar-inner">
          <div className="sidebar-head">
            <span className="space-avatar notes-avatar">
              <Icon name="bulb" size={18} />
            </span>
            <div>
              <div className="sidebar-title">Notes</div>
              <div className="sidebar-sub">Saved in your Nextcloud</div>
            </div>
          </div>
          {sideLink('/notes', 'bulb', 'Notes', view.kind === 'notes')}
          {state.labels.length > 0 && <div className="side-group-label">Labels</div>}
          {state.labels.map((l) => (
            <span key={l}>{sideLink(`/notes?label=${encodeURIComponent(l)}`, 'label', l, view.kind === 'label' && view.label === l)}</span>
          ))}
          <button className="side-link side-link-btn" onClick={() => setEditingLabels(true)}>
            <Icon name="edit" /> Edit labels
          </button>
          <div className="side-sep" />
          {sideLink('/notes?view=archive', 'archive', 'Archive', view.kind === 'archive')}
        </div>
      </aside>

      <main className="main notes-main" onPaste={(e) => openNote && e.clipboardData.files.length && addImages(store, openNote.key, Array.from(e.clipboardData.files), setToast)}>
        <div className="notes-top">
          <label className="search-input notes-search">
            <Icon name="search" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" aria-label="Search notes" />
          </label>
          <span className={`notes-status${state.offline ? ' is-offline' : ''}`} aria-live="polite">
            {state.offline ? (
              <>
                <Icon name="cloudOff" size={14} /> Offline: changes are kept and will sync
              </>
            ) : state.syncing || state.notes.some((n) => n.dirty) ? (
              'Syncing…'
            ) : state.synced ? (
              <>
                <Icon name="check" size={14} /> Saved to Nextcloud
              </>
            ) : null}
          </span>
        </div>

        {view.kind !== 'archive' && <Composer store={store} labels={state.labels} defaultLabel={view.kind === 'label' ? view.label : null} onError={setToast} />}

        {loading ? (
          <div className="notes-grid">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="note-card note-skeleton" style={{ height: 90 + ((i * 37) % 90) }} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="notes-empty">
            <Icon name={view.kind === 'archive' ? 'archive' : view.kind === 'label' ? 'label' : 'bulb'} size={96} />
            <p>
              {q
                ? 'No matching notes.'
                : view.kind === 'archive'
                  ? 'Your archived notes appear here.'
                  : view.kind === 'label'
                    ? 'No notes with this label yet.'
                    : 'Notes you add appear here.'}
            </p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                <h2 className="notes-section">Pinned</h2>
                <div className="notes-grid">{pinned.map(card)}</div>
                {others.length > 0 && <h2 className="notes-section">Others</h2>}
              </>
            )}
            <div className="notes-grid">{others.map(card)}</div>
          </>
        )}
      </main>

      {openNote && (
        <NoteEditor
          note={openNote}
          store={store}
          labels={state.labels}
          onClose={() => setOpenKey(null)}
          onShare={() => setSharing(openNote)}
          onImages={(files) => (files ? addImages(store, openNote.key, files, setToast) : pickImages(openNote.key))}
          onError={setToast}
        />
      )}
      {sharing && sharing.path && (
        <ShareDialog
          item={{ id: sharing.id ?? 0, path: sharing.path, name: sharing.path.split('/').pop()!, isDir: false, mime: 'text/markdown', hasPreview: false, shareTypes: sharing.shareTypes } as unknown as FileRow}
          onClose={() => {
            setSharing(null)
            store.sync(300)
          }}
          onChanged={() => null}
        />
      )}
      {sharing && !sharing.path && <SaveFirst onClose={() => setSharing(null)} />}
      {editingLabels && <EditLabels store={store} labels={state.labels} onClose={() => setEditingLabels(false)} />}
      {picker.element}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button className="icon-btn icon-btn-sm" aria-label="Dismiss" onClick={() => setToast(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  )
}

function SaveFirst({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Not saved yet" onClose={onClose} width={400} footer={<button className="btn btn-primary" onClick={onClose}>OK</button>}>
      <p>This note is still being saved to Nextcloud. Try sharing it again in a moment.</p>
    </Modal>
  )
}

/** "Take a note…": expands on focus; the note is created on the first keystroke and saved as you type. */
function Composer({ store, labels, defaultLabel, onError }: { store: NotesStore; labels: string[]; defaultLabel: string | null; onError: (msg: string) => void }) {
  const [key, setKey] = useState<string | null>(null)
  const [open, setOpen] = useState<false | 'text' | 'list'>(false)
  const box = useRef<HTMLDivElement>(null)
  const note = key ? store.find(key) : undefined
  const picker = useImagePicker((files) => {
    const k = key ?? store.create({ labels: defaultLabel ? [defaultLabel] : [] })
    setKey(k)
    setOpen((o) => o || 'text')
    addImages(store, k, files, onError)
  })

  const close = () => {
    const n = key ? store.find(key) : undefined
    if (n && !n.title.trim() && !n.body.replace(/- \[ \] ?/g, '').trim()) store.remove(n.key)
    setKey(null)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current?.contains(e.target as Node)) return
      if ((e.target as HTMLElement).closest('.menu-panel, .modal-backdrop')) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const change = (data: { title?: string; body?: string }) => {
    if (note) return store.edit(note.key, data)
    const k = store.create({ title: data.title ?? '', body: data.body ?? (open === 'list' ? '- [ ] ' : ''), labels: defaultLabel ? [defaultLabel] : [] })
    setKey(k)
  }

  if (!open)
    return (
      <div className="note-composer is-collapsed" ref={box}>
        <button className="note-composer-input" onClick={() => setOpen('text')}>
          Take a note…
        </button>
        <button className="icon-btn note-tool" aria-label="New list" title="New list" onClick={() => setOpen('list')}>
          <Icon name="checklist" />
        </button>
        <button className="icon-btn note-tool" aria-label="New note with image" title="New note with image" onClick={picker.open}>
          <Icon name="image" />
        </button>
        {picker.element}
      </div>
    )

  return (
    <div className="note-composer" data-color={note?.color ?? 'default'} ref={box} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <NoteFields
        title={note?.title ?? ''}
        body={note?.body ?? (open === 'list' ? '- [ ] ' : '')}
        path={note?.path ?? null}
        onChange={change}
        autoFocus="body"
      />
      <div className="note-editor-foot">
        {note ? (
          <NoteToolbar note={note} store={store} labels={labels} onShare={() => onError('Open the note to share it once it’s saved.')} onImages={picker.open} onError={onError} />
        ) : (
          <span />
        )}
        <button className="btn btn-subtle" onClick={close}>
          Close
        </button>
      </div>
      {picker.element}
    </div>
  )
}

function NoteEditor({
  note,
  store,
  labels,
  onClose,
  onShare,
  onImages,
  onError,
}: {
  note: Note
  store: NotesStore
  labels: string[]
  onClose: () => void
  onShare: () => void
  onImages: (files?: File[]) => void
  onError: (msg: string) => void
}) {
  const { text } = splitBody(note.body)
  const [dragging, setDragging] = useState(false)
  // Close empty notes away, like Keep.
  const close = () => {
    if (!note.title.trim() && !note.body.trim()) store.remove(note.key)
    onClose()
  }
  return (
    <div
      className="modal-backdrop note-editor-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      // Escape closes an open colour/label menu first, then the note.
      onKeyDown={(e) => e.key === 'Escape' && !document.querySelector('.note-editor .menu-panel') && close()}
    >
      <div
        className={`note-editor${dragging ? ' is-drop' : ''}`}
        data-color={note.color}
        role="dialog"
        aria-modal="true"
        aria-label={note.title || 'Note'}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer.types).includes('Files')) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setDragging(false)
          onImages(Array.from(e.dataTransfer.files))
        }}
      >
        <button className={`icon-btn note-pin is-visible${note.pinned ? ' is-on' : ''}`} aria-label={note.pinned ? 'Unpin note' : 'Pin note'} onClick={() => store.setPinned(note.key, !note.pinned)}>
          <Icon name={note.pinned ? 'pinFilled' : 'pin'} />
        </button>
        <div className="note-editor-scroll">
          <NoteFields title={note.title} body={note.body} path={note.path} onChange={(d) => store.edit(note.key, d)} autoFocus={note.title || text ? undefined : 'body'} />
          {note.labels.length > 0 && (
            <div className="note-card-meta">
              {note.labels.map((l) => (
                <span key={l} className="note-chip">
                  {l}
                  <button aria-label={`Remove label ${l}`} onClick={() => store.setLabels(note.key, note.labels.filter((x) => x !== l))}>
                    <Icon name="close" size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="note-edited" suppressHydrationWarning>
            {note.dirty ? 'Saving…' : `Edited ${fmtRelative(note.mtime)}`}
          </p>
        </div>
        <div className="note-editor-foot">
          <NoteToolbar
            note={note}
            store={store}
            labels={labels}
            onShare={onShare}
            onImages={() => onImages()}
            onError={onError}
          />
          <button className="btn btn-subtle" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function EditLabels({ store, labels, onClose }: { store: NotesStore; labels: string[]; onClose: () => void }) {
  const [draft, setDraft] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const act = async (from: string | null, to: string | null) => {
    setBusy(true)
    setError(await store.editLabel(from, to))
    setBusy(false)
  }
  return (
    <Modal title="Edit labels" onClose={onClose} width={380} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <form
        className="label-edit-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          act(null, draft.trim()).then(() => setDraft(''))
        }}
      >
        <Icon name="plus" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Create new label" maxLength={50} autoFocus />
        <button className="icon-btn" disabled={busy || !draft.trim()} aria-label="Create label">
          <Icon name="check" />
        </button>
      </form>
      {labels.map((l) => (
        <form
          key={l}
          className="label-edit-row"
          onSubmit={(e) => {
            e.preventDefault()
            const to = (names[l] ?? l).trim()
            if (to && to !== l) act(l, to)
          }}
        >
          <button type="button" className="icon-btn" aria-label={`Delete label ${l}`} title="Delete label" disabled={busy} onClick={() => confirm(`Delete the label “${l}”? Notes keep their content.`) && act(l, null)}>
            <Icon name="trash" />
          </button>
          <input value={names[l] ?? l} onChange={(e) => setNames({ ...names, [l]: e.target.value })} maxLength={50} aria-label={`Rename ${l}`} />
          <button className="icon-btn" disabled={busy || !(names[l] ?? l).trim() || (names[l] ?? l) === l} aria-label={`Save ${l}`}>
            <Icon name="check" />
          </button>
        </form>
      ))}
      {error && <div className="banner banner-error">{error}</div>}
    </Modal>
  )
}
