'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { asChecklist, checklistText, imageUrl, joinBody, splitBody, type CheckItem } from '@/lib/notesModel'
import { Icon } from '../Icon'

/** A textarea that grows with its content. */
export function AutoText(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

/**
 * Title, images and body (plain text or a checklist) of one note. Changes go
 * straight to `onChange` (the store saves them in the background).
 */
export function NoteFields({
  title,
  body,
  path,
  onChange,
  autoFocus,
  readOnly = false,
}: {
  title: string
  body: string
  path: string | null
  onChange: (data: { title?: string; body?: string }) => void
  autoFocus?: 'title' | 'body'
  readOnly?: boolean
}) {
  const { images, text } = splitBody(body)
  const items = asChecklist(text)
  const setText = (t: string) => onChange({ body: joinBody(images, t) })

  return (
    <div className="note-fields">
      {images.length > 0 && path && (
        <div className={`note-images note-images-${Math.min(images.length, 3)}`}>
          {images.map((href) => (
            <div key={href} className="note-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(path, href)} alt="" />
              {!readOnly && (
                <button className="note-image-remove" aria-label="Remove image" title="Remove image" onClick={() => onChange({ body: joinBody(images.filter((h) => h !== href), text) })}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <AutoText
        className="note-title-input"
        placeholder="Title"
        value={title}
        maxLength={300}
        readOnly={readOnly}
        autoFocus={autoFocus === 'title'}
        onChange={(e) => onChange({ title: e.target.value.replace(/\n/g, ' ') })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.currentTarget.closest('.note-fields')?.querySelector('.note-body-input, .check-input') as HTMLElement | null)?.focus()
          }
        }}
      />
      {items ? (
        <Checklist items={items} readOnly={readOnly} autoFocus={autoFocus === 'body'} onChange={(next) => setText(checklistText(next))} />
      ) : (
        <AutoText className="note-body-input" placeholder="Take a note…" value={text} readOnly={readOnly} autoFocus={autoFocus === 'body'} onChange={(e) => setText(e.target.value)} />
      )}
    </div>
  )
}

/** Keep-style checklist: Enter adds an item, Backspace on an empty one removes it, ticked items sink to the bottom. */
function Checklist({ items, onChange, readOnly, autoFocus }: { items: CheckItem[]; onChange: (items: CheckItem[]) => void; readOnly: boolean; autoFocus?: boolean }) {
  const [focus, setFocus] = useState<number | null>(autoFocus ? 0 : null)
  const [showDone, setShowDone] = useState(true)
  const root = useRef<HTMLDivElement>(null)
  const order = items.map((it, i) => ({ it, i }))
  const open = order.filter((x) => !x.it.checked)
  const done = order.filter((x) => x.it.checked)

  useEffect(() => {
    if (focus === null) return
    const el = root.current?.querySelector<HTMLInputElement>(`[data-index="${focus}"]`)
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
    setFocus(null)
  }, [focus])

  const update = (i: number, patch: Partial<CheckItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const insertAfter = (i: number) => {
    const next = [...items]
    next.splice(i + 1, 0, { checked: false, text: '' })
    onChange(next)
    setFocus(i + 1)
  }
  const removeAt = (i: number) => {
    if (items.length === 1) return onChange([{ checked: false, text: '' }])
    onChange(items.filter((_, j) => j !== i))
    const prev = open.filter((x) => x.i < i).pop()?.i ?? 0
    setFocus(prev > i ? prev - 1 : prev)
  }

  const row = ({ it, i }: { it: CheckItem; i: number }) => (
    <div key={i} className={`check-row${it.checked ? ' is-done' : ''}`}>
      <input type="checkbox" checked={it.checked} disabled={readOnly} onChange={() => update(i, { checked: !it.checked })} aria-label={it.checked ? 'Untick' : 'Tick'} />
      <input
        className="check-input"
        data-index={i}
        value={it.text}
        readOnly={readOnly}
        placeholder="List item"
        onChange={(e) => update(i, { text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            insertAfter(i)
          } else if (e.key === 'Backspace' && !it.text) {
            e.preventDefault()
            removeAt(i)
          }
        }}
      />
      {!readOnly && (
        <button className="icon-btn icon-btn-sm check-remove" tabIndex={-1} aria-label="Remove item" onClick={() => removeAt(i)}>
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )

  return (
    <div className="checklist" ref={root}>
      {open.map(row)}
      {!readOnly && (
        <button className="check-add" onClick={() => insertAfter(items.length - 1)}>
          <Icon name="plus" size={14} /> List item
        </button>
      )}
      {done.length > 0 && (
        <>
          <button className="check-done-toggle" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
            <Icon name="chevronDown" size={14} className={showDone ? '' : 'rot-270'} /> {done.length} ticked item{done.length > 1 ? 's' : ''}
          </button>
          {showDone && done.map(row)}
        </>
      )}
    </div>
  )
}
