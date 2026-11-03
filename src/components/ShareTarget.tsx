'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { listSubfolders } from '@/app/(app)/files/actions'
import { createIssue, loadIssueOptions } from '@/app/(app)/projects/actions'
import { clearShared, readShared, type SharedItems } from '@/lib/sharedItems'
import { uploadWithProgress } from './attachments/upload'
import { folderHref, fmtSize } from './files/paths'
import { TypeGlyph } from './files/FileIcon'
import { fileKind } from './files/paths'
import { Icon } from './Icon'
import { startNavProgress } from './NavProgress'
import { addImages } from './notes/NoteTools'
import { notesStore } from './notes/store'

type Choice = null | 'files' | 'note' | 'issue'

/**
 * Android share sheet → AvroNext: the service worker kept what was shared in the
 * browser; here the user picks where it goes (a Files folder, a new note, a new issue).
 */
export function ShareTarget({ uid, projects }: { uid: string; projects: { id: number; title: string }[] }) {
  const router = useRouter()
  const [shared, setShared] = useState<SharedItems | null | undefined>(undefined)
  const [choice, setChoice] = useState<Choice>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    readShared().then(setShared)
  }, [])

  const previews = useMemo(() => (shared?.files ?? []).map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [shared])
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews])

  const text = [shared?.text, shared?.url && !shared.text?.includes(shared.url) ? shared.url : ''].filter(Boolean).join('\n')
  // Files reads the shared items itself (it clears them once uploading), so keep them for it.
  const go = async (href: string, keep = false) => {
    if (!keep) await clearShared()
    startNavProgress()
    router.push(href)
  }

  if (shared === undefined) return <main className="main share-page" />
  if (!shared)
    return (
      <main className="main share-page">
        <div className="share-empty">
          <Icon name="share" size={48} />
          <p>Nothing to save. Share a photo, file or link to AvroNext from another app.</p>
        </div>
      </main>
    )

  const images = shared.files.filter((f) => f.type.startsWith('image/'))

  const toNote = async () => {
    setBusy('Saving note…')
    const store = notesStore(uid)
    store.start()
    const key = store.create({ title: shared.title.slice(0, 200), body: text })
    if (images.length) await addImages(store, key, images, setError)
    await store.flush()
    go('/notes')
  }

  return (
    <main className="main share-page">
      <h1 className="share-heading">Save to AvroNext</h1>
      <section className="share-items">
        {shared.title && <strong className="share-title">{shared.title}</strong>}
        {text && <p className="share-text">{text}</p>}
        {shared.files.length > 0 && (
          <ul className="share-files">
            {shared.files.map((f, i) => (
              <li key={i}>
                {previews[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[i]!} alt="" />
                ) : (
                  <TypeGlyph kind={fileKind({ name: f.name, isDir: false, mime: f.type })} size={40} />
                )}
                <span className="share-file-name">{f.name}</span>
                <span className="muted small">{fmtSize(f.size)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!choice && (
        <div className="sheet-actions">
          {shared.files.length > 0 && (
            <button className="sheet-action" onClick={() => setChoice('files')}>
              <span className="sheet-action-icon">
                <Icon name="folder" size={22} />
              </span>
              Save to Files
            </button>
          )}
          <button className="sheet-action" onClick={toNote} disabled={Boolean(busy)}>
            <span className="sheet-action-icon">
              <Icon name="bulbFilled" size={22} />
            </span>
            New note{shared.files.length > images.length ? ' (images only)' : ''}
          </button>
          {projects.length > 0 && (
            <button className="sheet-action" onClick={() => setChoice('issue')}>
              <span className="sheet-action-icon">
                <Icon name="task" size={22} />
              </span>
              New issue
            </button>
          )}
          <button className="btn btn-subtle share-cancel" onClick={() => go('/')}>
            Cancel
          </button>
        </div>
      )}

      {choice === 'files' && <FolderPick onCancel={() => setChoice(null)} onPick={(dir) => go(`${folderHref(dir)}?shared=1`, true)} />}
      {choice === 'issue' && (
        <IssueForm
          projects={projects}
          title={shared.title || shared.files[0]?.name || text.split('\n')[0] || ''}
          description={text}
          onCancel={() => setChoice(null)}
          onCreate={async (boardId, stackId, title, description) => {
            setBusy('Creating issue…')
            setError(null)
            const r = await createIssue(boardId, stackId, title, description)
            if (!r.ok) {
              setBusy(null)
              return setError(r.error)
            }
            for (const f of shared.files) {
              setBusy(`Attaching ${f.name}…`)
              await uploadWithProgress(`/api/attachments/card/${r.data.id}?board=${boardId}&stack=${stackId}`, f, () => {}).catch((e: Error) => setError(e.message))
            }
            go(`/projects/${boardId}?issue=${r.data.id}`)
          }}
        />
      )}
      {busy && <p className="muted share-busy">{busy}</p>}
      {error && <div className="banner banner-error">{error}</div>}
    </main>
  )
}

/** A step-by-step folder list: tap into folders, "Save here". */
function FolderPick({ onPick, onCancel }: { onPick: (dir: string) => void; onCancel: () => void }) {
  const [path, setPath] = useState('/')
  const [folders, setFolders] = useState<{ path: string; name: string }[] | null>(null)
  const [canCreate, setCanCreate] = useState(true)
  useEffect(() => {
    setFolders(null)
    listSubfolders(path).then((r) => {
      if (!r.ok) return setFolders([])
      setFolders(r.data.folders)
      setCanCreate(r.data.canCreate)
    })
  }, [path])
  const parent = path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/'
  return (
    <section className="share-pick">
      <div className="share-pick-head">
        {parent !== null && (
          <button className="icon-btn" aria-label="Up" onClick={() => setPath(parent)}>
            <Icon name="arrowBack" />
          </button>
        )}
        <strong>{path === '/' ? 'My files' : path.split('/').pop()}</strong>
      </div>
      <ul className="share-folders">
        {folders === null && <li className="muted small">Loading…</li>}
        {folders?.length === 0 && <li className="muted small">No folders here.</li>}
        {folders?.map((f) => (
          <li key={f.path}>
            <button className="sheet-action" onClick={() => setPath(f.path)}>
              <TypeGlyph kind="folder" size={28} /> {f.name}
              <Icon name="chevronRight" className="share-chevron" />
            </button>
          </li>
        ))}
      </ul>
      <div className="btn-row">
        <button className="btn btn-subtle" onClick={onCancel}>
          Back
        </button>
        <button className="btn btn-primary" disabled={!canCreate} onClick={() => onPick(path)}>
          Save here
        </button>
      </div>
    </section>
  )
}

function IssueForm({
  projects,
  title: initialTitle,
  description,
  onCreate,
  onCancel,
}: {
  projects: { id: number; title: string }[]
  title: string
  description: string
  onCreate: (boardId: number, stackId: number, title: string, description: string) => void
  onCancel: () => void
}) {
  const [boardId, setBoardId] = useState(projects[0].id)
  const [stacks, setStacks] = useState<{ id: number; title: string }[]>([])
  const [stackId, setStackId] = useState<number | null>(null)
  const [title, setTitle] = useState(initialTitle.slice(0, 255))
  useEffect(() => {
    setStacks([])
    loadIssueOptions(boardId).then((r) => {
      if (!r.ok) return
      setStacks(r.data.stacks)
      setStackId(r.data.stacks[0]?.id ?? null)
    })
  }, [boardId])
  return (
    <form
      className="share-pick"
      onSubmit={(e) => {
        e.preventDefault()
        if (stackId && title.trim()) onCreate(boardId, stackId, title.trim(), description)
      }}
    >
      <label className="field">
        <span>Project</span>
        <select value={boardId} onChange={(e) => setBoardId(Number(e.target.value))}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Status</span>
        <select value={stackId ?? ''} onChange={(e) => setStackId(Number(e.target.value))} disabled={!stacks.length}>
          {stacks.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Summary</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} required />
      </label>
      <div className="btn-row">
        <button type="button" className="btn btn-subtle" onClick={onCancel}>
          Back
        </button>
        <button className="btn btn-primary" disabled={!stackId || !title.trim()}>
          Create issue
        </button>
      </div>
    </form>
  )
}
