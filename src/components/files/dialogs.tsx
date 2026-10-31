'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createFolder, listSubfolders, renameItem } from '@/app/(app)/files/actions'
import type { FileRow } from '@/app/(app)/files/data'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import { TypeGlyph } from './FileIcon'
import { parentOf } from './paths'

/** New folder (with `parent`) or rename (with `renaming`). */
export function NameDialog({
  title,
  action,
  initial,
  parent,
  renaming,
  onClose,
  onDone,
}: {
  title: string
  action: string
  initial: string
  parent?: string
  renaming?: FileRow
  onClose: () => void
  onDone: (item: FileRow) => void
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = input.current
    if (!el) return
    el.focus()
    // Select the name without its extension, like a desktop.
    const dot = renaming && !renaming.isDir ? initial.lastIndexOf('.') : -1
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial, renaming])

  const submit = () =>
    start(async () => {
      const n = name.trim()
      if (!n) return setError('Enter a name.')
      if (renaming && n === renaming.name) return onClose()
      const r = renaming ? await renameItem(renaming.path, n) : await createFolder(parent ?? '/', n)
      if (!r.ok) return setError(r.error)
      onDone({ ...(renaming ?? {}), ...r.data } as FileRow)
      onClose()
    })

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending}>
            {action}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="field">
          <span>Name</span>
          <input ref={input} value={name} onChange={(e) => (setName(e.target.value), setError(null))} maxLength={250} aria-invalid={Boolean(error)} />
        </label>
        {error && <div className="banner banner-error">{error}</div>}
      </form>
    </Modal>
  )
}

export function DeleteDialog({ items, onClose, onConfirm }: { items: FileRow[]; onClose: () => void; onConfirm: () => void }) {
  const one = items.length === 1 ? items[0] : null
  return (
    <Modal
      title={one ? `Delete “${one.name}”?` : `Delete ${items.length} items?`}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm} autoFocus>
            Delete
          </button>
        </>
      }
    >
      <p>
        {one?.isDir ? 'The folder and everything in it' : one ? 'The file' : 'They'} will go to Nextcloud’s <strong>Deleted files</strong>, where you can restore{' '}
        {one ? 'it' : 'them'} for a while.
      </p>
      {one?.shareTypes.length ? <p className="muted small">It’s shared: people will lose access.</p> : null}
    </Modal>
  )
}

type Folder = { path: string; name: string }

/** Folder picker for Move to / Copy to. */
export function MoveDialog({
  op,
  items,
  start,
  onClose,
  onPick,
}: {
  op: 'move' | 'copy'
  items: FileRow[]
  start: string
  onClose: () => void
  onPick: (dest: string) => void
}) {
  const [at, setAt] = useState(start)
  const [folders, setFolders] = useState<Folder[] | null>(null)
  const [canCreate, setCanCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [making, setMaking] = useState<string | null>(null)
  const seq = useRef(0)
  const moving = new Set(items.map((i) => i.path))

  const load = async (path: string) => {
    const mine = ++seq.current
    setFolders(null)
    setError(null)
    const r = await listSubfolders(path)
    if (mine !== seq.current) return
    if (!r.ok) {
      if (path !== '/') return load('/')
      return setError(r.error)
    }
    setAt(r.data.path)
    setFolders(r.data.folders)
    setCanCreate(r.data.canCreate)
  }
  useEffect(() => {
    load(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const parts = at.split('/').filter(Boolean)
  const blocked = [...moving].some((p) => at === p || at.startsWith(p + '/'))
  const sameFolder = op === 'move' && items.every((i) => parentOf(i.path) === at)
  const verb = op === 'move' ? 'Move' : 'Copy'
  const what = items.length === 1 ? `“${items[0].name}”` : `${items.length} items`

  return (
    <Modal
      title={`${verb} ${what}`}
      onClose={onClose}
      width={520}
      className="files-move"
      footer={
        <>
          {canCreate && making === null && (
            <button className="btn btn-subtle files-move-new" onClick={() => setMaking('New folder')}>
              <Icon name="folderPlus" /> New folder
            </button>
          )}
          <button className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!folders || !canCreate || blocked || sameFolder} onClick={() => onPick(at)}>
            {verb} here
          </button>
        </>
      }
    >
      <nav className="files-move-crumbs" aria-label="Folder">
        <button className="files-move-crumb" onClick={() => load('/')}>
          My files
        </button>
        {parts.map((p, i) => (
          <span key={i}>
            <Icon name="chevronRight" size={12} />
            <button className="files-move-crumb" onClick={() => load('/' + parts.slice(0, i + 1).join('/'))}>
              {p}
            </button>
          </span>
        ))}
      </nav>
      <ul className="files-move-list">
        {making !== null && (
          <li className="files-move-row">
            <TypeGlyph kind="folder" size={22} />
            <form
              className="files-move-make"
              onSubmit={async (e) => {
                e.preventDefault()
                const r = await createFolder(at, making)
                if (!r.ok) return setError(r.error)
                setMaking(null)
                load(r.data.path)
              }}
            >
              <input autoFocus value={making} onChange={(e) => setMaking(e.target.value)} onFocus={(e) => e.target.select()} aria-label="Folder name" />
              <button className="btn btn-primary btn-sm">Create</button>
              <button type="button" className="btn btn-subtle btn-sm" onClick={() => setMaking(null)}>
                Cancel
              </button>
            </form>
          </li>
        )}
        {folders === null && !error && <li className="muted small files-move-empty">Loading…</li>}
        {folders?.length === 0 && making === null && <li className="muted small files-move-empty">No folders here.</li>}
        {folders?.map((f) => {
          const isMoving = moving.has(f.path)
          return (
            <li key={f.path}>
              <button className="files-move-row" disabled={isMoving} onClick={() => load(f.path)} title={isMoving ? 'This is one of the items you’re moving' : undefined}>
                <TypeGlyph kind="folder" size={22} />
                <span className="files-move-name">{f.name}</span>
                <Icon name="chevronRight" size={14} />
              </button>
            </li>
          )
        })}
      </ul>
      {error && <div className="banner banner-error">{error}</div>}
      {blocked && <p className="muted small">A folder can’t go inside itself.</p>}
      {folders && !canCreate && <p className="muted small">You can’t add items to this folder.</p>}
    </Modal>
  )
}
