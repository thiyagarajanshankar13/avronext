'use client'
import { useRef, useState } from 'react'
import { asChecklist, checklistToText, checklistText, COLOR_NAMES, joinBody, NOTE_COLORS, splitBody, textToChecklist, type NoteColor } from '@/lib/notesModel'
import { Icon, type IconName } from '../Icon'
import { Menu } from '../Menu'
import type { Note, NotesStore } from './store'

/** Uploads images next to a note (saving a brand-new note first) and adds them to its body. */
export async function addImages(store: NotesStore, key: string, files: File[], onError: (msg: string) => void) {
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (!images.length) return onError('Only images can be added to notes.')
  const note = await store.ensureSaved(key)
  if (!note?.path) return onError('The note couldn’t be saved yet; try again in a moment.')
  for (const file of images) {
    const name = file.name && file.name !== 'image.png' ? file.name : `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.${(file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`
    try {
      const res = await fetch(`/api/attachments/note?${new URLSearchParams({ path: note.path, name })}`, { method: 'POST', body: file })
      const data = (await res.json().catch(() => ({}))) as { href?: string; error?: string }
      if (!res.ok || !data.href) {
        onError(data.error ?? `Upload failed (${res.status})`)
        continue
      }
      const current = store.find(key)
      if (!current) return
      const { images: list, text } = splitBody(current.body)
      store.edit(key, { body: joinBody([...list, data.href], text) })
    } catch {
      onError('Upload failed: network error.')
    }
  }
}

function ToolButton({ icon, label, onClick, active }: { icon: IconName; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      className={`icon-btn note-tool${active ? ' is-active' : ''}`}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <Icon name={icon} />
    </button>
  )
}

export function ColorPicker({ value, onPick }: { value: NoteColor; onPick: (c: NoteColor) => void }) {
  return (
    <Menu
      className="note-tool-menu"
      label="Background colour"
      trigger={
        <span className="icon-btn note-tool" title="Background colour">
          <Icon name="palette" />
        </span>
      }
    >
      {() => (
        <div className="note-colors" role="radiogroup" aria-label="Background colour">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={value === c}
              aria-label={COLOR_NAMES[c]}
              title={COLOR_NAMES[c]}
              className={`note-swatch${value === c ? ' is-on' : ''}`}
              data-color={c}
              onClick={(e) => {
                e.stopPropagation()
                onPick(c)
              }}
            >
              {value === c && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </Menu>
  )
}

export function LabelPicker({
  value,
  all,
  onChange,
  onCreate,
}: {
  value: string[]
  all: string[]
  onChange: (labels: string[]) => void
  onCreate: (label: string) => void
}) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = all.filter((l) => l.toLowerCase().includes(needle))
  const exact = all.some((l) => l.toLowerCase() === needle)
  return (
    <Menu
      className="note-tool-menu"
      label="Labels"
      trigger={
        <span className="icon-btn note-tool" title="Labels">
          <Icon name="label" />
        </span>
      }
    >
      {() => (
        <div className="note-label-picker" onClick={(e) => e.stopPropagation()}>
          <div className="menu-heading">Label note</div>
          <input className="note-label-search" placeholder="Enter label name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus maxLength={50} />
          {shown.map((l) => (
            <label key={l} className="menu-item menu-check">
              <input type="checkbox" checked={value.includes(l)} onChange={() => onChange(value.includes(l) ? value.filter((x) => x !== l) : [...value, l])} />
              <span>{l}</span>
            </label>
          ))}
          {needle && !exact && (
            <button
              className="menu-item"
              onClick={() => {
                const label = q.trim()
                onCreate(label)
                onChange([...value, label])
                setQ('')
              }}
            >
              <Icon name="plus" /> Create “{q.trim()}”
            </button>
          )}
        </div>
      )}
    </Menu>
  )
}

/** The action row shown on a card (on hover) and at the bottom of the editor. */
export function NoteToolbar({
  note,
  store,
  labels,
  onShare,
  onImages,
  onError,
  compact = false,
}: {
  note: Note
  store: NotesStore
  labels: string[]
  onShare: () => void
  onImages: () => void
  onError: (msg: string) => void
  compact?: boolean
}) {
  const { images, text } = splitBody(note.body)
  const checklist = asChecklist(text)
  return (
    <div className="note-toolbar" onClick={(e) => e.stopPropagation()}>
      <ColorPicker value={note.color} onPick={(c) => store.setColor(note.key, c)} />
      <LabelPicker
        value={note.labels}
        all={labels}
        onChange={(l) => store.setLabels(note.key, l)}
        onCreate={(l) => store.editLabel(null, l).then((err) => err && onError(err))}
      />
      <ToolButton icon="image" label="Add image" onClick={onImages} />
      {!compact && (
        <ToolButton
          icon={checklist ? 'textMode' : 'checklist'}
          label={checklist ? 'Hide tick boxes' : 'Show tick boxes'}
          onClick={() =>
            store.edit(note.key, { body: joinBody(images, checklist ? checklistToText(checklist) : checklistText(textToChecklist(text).length ? textToChecklist(text) : [{ checked: false, text: '' }])) })
          }
        />
      )}
      <ToolButton icon={note.archived ? 'unarchive' : 'archive'} label={note.archived ? 'Unarchive' : 'Archive'} onClick={() => store.setArchived(note.key, !note.archived)} />
      <ToolButton icon="share" label="Share" onClick={onShare} />
      <ToolButton icon="trash" label="Delete note" onClick={() => store.remove(note.key)} />
    </div>
  )
}

/** Hidden file input + drag/paste helpers for adding images. */
export function useImagePicker(onFiles: (files: File[]) => void) {
  const input = useRef<HTMLInputElement>(null)
  const element = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={(e) => {
        if (e.target.files?.length) onFiles(Array.from(e.target.files))
        e.target.value = ''
      }}
    />
  )
  return { open: () => input.current?.click(), element }
}
