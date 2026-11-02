'use client'
import { asChecklist, checklistText, imageUrl, joinBody, splitBody } from '@/lib/notesModel'
import { Icon } from '../Icon'
import type { Note, NotesStore } from './store'
import { NoteToolbar } from './NoteTools'

const MAX_ITEMS = 8

/** One note in the grid: images, title, text or checklist (tickable in place), labels; tools on hover. */
export function NoteCard({
  note,
  store,
  labels,
  onOpen,
  onShare,
  onImages,
  onError,
  onLabel,
}: {
  note: Note
  store: NotesStore
  labels: string[]
  onOpen: () => void
  onShare: () => void
  onImages: () => void
  onError: (msg: string) => void
  onLabel: (label: string) => void
}) {
  const { images, text } = splitBody(note.body)
  const items = asChecklist(text)
  const open = items?.map((it, i) => ({ it, i })).filter((x) => !x.it.checked) ?? []
  const done = items ? items.length - open.length : 0
  const empty = !note.title && !text.trim() && !images.length

  return (
    <article
      className="note-card"
      data-color={note.color}
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen()
      }}
      aria-label={note.title || text.slice(0, 60) || 'Empty note'}
    >
      {images.length > 0 && note.path && (
        <div className={`note-images note-images-${Math.min(images.length, 3)}`}>
          {images.slice(0, 6).map((href) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={href} src={imageUrl(note.path!, href)} alt="" loading="lazy" />
          ))}
        </div>
      )}
      <button
        className={`icon-btn note-pin${note.pinned ? ' is-on' : ''}`}
        aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
        title={note.pinned ? 'Unpin note' : 'Pin note'}
        onClick={(e) => {
          e.stopPropagation()
          store.setPinned(note.key, !note.pinned)
        }}
      >
        <Icon name={note.pinned ? 'pinFilled' : 'pin'} />
      </button>
      <div className="note-card-body">
        {note.title && <h3 className="note-card-title">{note.title}</h3>}
        {items ? (
          <ul className="note-card-checks">
            {open.slice(0, MAX_ITEMS).map(({ it, i }) => (
              <li key={i}>
                <input
                  type="checkbox"
                  checked={false}
                  aria-label={`Tick ${it.text}`}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => store.edit(note.key, { body: joinBody(images, checklistText(items.map((x, j) => (j === i ? { ...x, checked: true } : x)))) })}
                />
                <span>{it.text}</span>
              </li>
            ))}
            {open.length > MAX_ITEMS && <li className="note-card-more">…</li>}
            {done > 0 && (
              <li className="note-card-more">
                + {done} ticked item{done > 1 ? 's' : ''}
              </li>
            )}
          </ul>
        ) : (
          text.trim() && <p className="note-card-text">{text.length > 1200 ? text.slice(0, 1200) + '…' : text}</p>
        )}
        {empty && <p className="note-card-text muted">Empty note</p>}
        {(note.labels.length > 0 || note.shareTypes.length > 0) && (
          <div className="note-card-meta">
            {note.labels.map((l) => (
              <button
                key={l}
                className="note-chip"
                onClick={(e) => {
                  e.stopPropagation()
                  onLabel(l)
                }}
              >
                {l}
              </button>
            ))}
            {note.shareTypes.length > 0 && (
              <span className="note-chip note-chip-shared" title="Shared">
                <Icon name="share" size={12} /> Shared
              </span>
            )}
          </div>
        )}
      </div>
      <NoteToolbar note={note} store={store} labels={labels} onShare={onShare} onImages={onImages} onError={onError} compact />
      {note.dirty && <span className="note-unsaved" title="Saving…" aria-label="Saving" />}
    </article>
  )
}
