'use client'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { browseFiles, discardMailDraft, findRecipients, keepMailDraft, saveMailDraft, sendMail, type Draft } from '@/app/(app)/mail/actions'
import type { MailAddress, OutgoingAttachment } from '@/lib/nextcloud/mail'
import { fmtSize, uploadWithProgress } from '../attachments/upload'
import { RichEditor, type RichEditorHandle } from '../editor/RichEditor'
import { Icon } from '../Icon'
import { Modal } from '../Modal'

export type ComposeInit = {
  title: string
  to: MailAddress[]
  cc: MailAddress[]
  bcc?: MailAddress[]
  subject: string
  /** Starting body as HTML (quote of the original, signature…). */
  html: string
  attachments?: { name: string; size?: number; att: OutgoingAttachment }[]
  inReplyToMessageId?: string | null
  replyTo?: number | null
  forwardOf?: number | null
  /** Editing a draft from the Drafts folder: it's removed once sent. */
  replacesMessageId?: number | null
}

type Att = { key: string; name: string; size?: number; status: 'uploading' | 'ready' | 'error'; error?: string; progress?: number; att?: OutgoingAttachment }

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/** "Ann <ann@x.com>" or "ann@x.com" → address. */
function parseAddress(text: string): MailAddress | null {
  const t = text.trim().replace(/[,;]$/, '').trim()
  const m = t.match(/^(.*)<([^>]+)>$/)
  const email = (m ? m[2] : t).trim()
  if (!EMAIL.test(email)) return null
  return { label: m ? m[1].trim().replace(/^"|"$/g, '') : '', email }
}

function RecipientInput({ label, value, onChange, autoFocus }: { label: string; value: MailAddress[]; onChange: (v: MailAddress[]) => void; autoFocus?: boolean }) {
  const [text, setText] = useState('')
  const [suggestions, setSuggestions] = useState<{ label: string; email: string }[]>([])
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const q = text.trim()
    if (q.length < 2) return setSuggestions([])
    const t = setTimeout(() => findRecipients(q).then((r) => r.ok && setSuggestions(r.data.filter((x) => !value.some((v) => v.email === x.email)))), 200)
    return () => clearTimeout(t)
  }, [text, value])
  const add = (a: MailAddress | null) => {
    if (!a) return false
    if (!value.some((v) => v.email.toLowerCase() === a.email.toLowerCase())) onChange([...value, a])
    setText('')
    setSuggestions([])
    return true
  }
  const commit = () => {
    if (!text.trim()) return true
    // Pasted lists: "a@x.com, b@y.com".
    const parts = text.split(/[,;\n]/).map(parseAddress)
    if (parts.every(Boolean)) {
      onChange([...value, ...(parts as MailAddress[]).filter((p) => !value.some((v) => v.email === p.email))])
      setText('')
      return true
    }
    return false
  }
  return (
    <div className="mail-recipients" onClick={() => input.current?.focus()}>
      <span className="mail-recipients-label">{label}</span>
      {value.map((a) => (
        <span key={a.email} className="mail-chip" title={a.email}>
          {a.label || a.email}
          <button type="button" aria-label={`Remove ${a.email}`} onClick={() => onChange(value.filter((v) => v !== a))}>
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
      <input
        ref={input}
        value={text}
        autoFocus={autoFocus}
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
        }}
        onBlur={() => setTimeout(() => commit(), 150)}
        onKeyDown={(e) => {
          if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length)
          } else if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
            if (suggestions.length && e.key !== ',' && e.key !== ';') {
              e.preventDefault()
              add(suggestions[active])
            } else if (text.trim()) {
              if (e.key !== 'Tab') e.preventDefault()
              commit()
            }
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
        }}
      />
      {suggestions.length > 0 && (
        <ul className="mail-suggest" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.email}>
              <button type="button" className={i === active ? 'is-active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>
                <strong>{s.label || s.email}</strong> {s.label && <span className="muted small">{s.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Pick files from Nextcloud Files to attach. */
function FilesPicker({ onPick, onClose }: { onPick: (files: { path: string; name: string; size: number }[]) => void; onClose: () => void }) {
  const [path, setPath] = useState('/')
  const [items, setItems] = useState<{ path: string; name: string; isDir: boolean; size: number }[] | null>(null)
  const [picked, setPicked] = useState<Map<string, { path: string; name: string; size: number }>>(new Map())
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setItems(null)
    browseFiles(path).then((r) => (r.ok ? setItems(r.data.items) : setError(r.error)))
  }, [path])
  const parent = path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/'
  return (
    <Modal
      title="Attach from Files"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!picked.size} onClick={() => onPick([...picked.values()])}>
            Attach{picked.size ? ` ${picked.size}` : ''}
          </button>
        </>
      }
    >
      <div className="mail-files-head">
        {parent !== null && (
          <button className="icon-btn" aria-label="Up" onClick={() => setPath(parent)}>
            <Icon name="arrowBack" />
          </button>
        )}
        <strong>{path === '/' ? 'My files' : path.split('/').pop()}</strong>
      </div>
      {error && <div className="banner banner-error">{error}</div>}
      <ul className="mail-files">
        {items === null && <li className="muted small">Loading…</li>}
        {items?.length === 0 && <li className="muted small">This folder is empty.</li>}
        {items?.map((it) =>
          it.isDir ? (
            <li key={it.path}>
              <button className="mail-file" onClick={() => setPath(it.path)}>
                <Icon name="folder" /> <span>{it.name}</span> <Icon name="chevronRight" />
              </button>
            </li>
          ) : (
            <li key={it.path}>
              <label className="mail-file">
                <input
                  type="checkbox"
                  checked={picked.has(it.path)}
                  onChange={(e) =>
                    setPicked((p) => {
                      const n = new Map(p)
                      if (e.target.checked) n.set(it.path, it)
                      else n.delete(it.path)
                      return n
                    })
                  }
                />
                <span>{it.name}</span>
                <span className="muted small">{fmtSize(it.size)}</span>
              </label>
            </li>
          ),
        )}
      </ul>
    </Modal>
  )
}

export function Compose({
  account,
  init,
  onClose,
  onSent,
}: {
  account: { id: number; email: string; name: string }
  init: ComposeInit
  onClose: (note?: string) => void
  onSent: () => void
}) {
  const [to, setTo] = useState(init.to)
  const [cc, setCc] = useState(init.cc)
  const [bcc, setBcc] = useState(init.bcc ?? [])
  const [showCc, setShowCc] = useState(init.cc.length > 0 || Boolean(init.bcc?.length))
  const [subject, setSubject] = useState(init.subject)
  const [atts, setAtts] = useState<Att[]>(() => (init.attachments ?? []).map((a, i) => ({ key: `i${i}`, name: a.name, size: a.size, status: 'ready', att: a.att })))
  const [error, setError] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<number | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const [sending, startSend] = useTransition()
  const editor = useRef<RichEditorHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const changed = useRef(false)
  const saving = useRef<Promise<number | null> | null>(null)

  const draft = useCallback(
    (): Draft => ({
      accountId: account.id,
      to,
      cc,
      bcc,
      subject,
      body: editor.current?.getMarkdown() ?? '',
      attachments: atts.filter((a) => a.status === 'ready' && a.att).map((a) => a.att!),
      inReplyToMessageId: init.inReplyToMessageId ?? null,
    }),
    [account.id, to, cc, bcc, subject, atts, init.inReplyToMessageId],
  )

  const saveDraft = useCallback(async () => {
    if (!changed.current) return draftId
    changed.current = false
    const run = (async () => {
      const r = await saveMailDraft(draft(), draftId)
      if (!r.ok) {
        changed.current = true
        return draftId
      }
      setDraftId(r.data)
      setSavedAt(Date.now())
      return r.data
    })()
    saving.current = run
    return run
  }, [draft, draftId])

  // Save a draft a few seconds after the last change.
  useEffect(() => {
    changed.current = true
    const t = setTimeout(() => void saveDraft(), 4000)
    return () => clearTimeout(t)
  }, [to, cc, bcc, subject, atts]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    changed.current = false
  }, [])

  const upload = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const key = `u${Date.now()}${Math.random()}`
      setAtts((a) => [...a, { key, name: file.name, size: file.size, status: 'uploading', progress: 0 }])
      uploadWithProgress<{ id: number }>('/api/mail/upload', file, (p) => setAtts((a) => a.map((x) => (x.key === key ? { ...x, progress: p } : x))))
        .then((r) => setAtts((a) => a.map((x) => (x.key === key ? { ...x, status: 'ready', att: { type: 'local', id: r.id } } : x))))
        .catch((e: Error) => setAtts((a) => a.map((x) => (x.key === key ? { ...x, status: 'error', error: e.message } : x))))
    }
  }

  const send = () =>
    startSend(async () => {
      setError(null)
      if (atts.some((a) => a.status === 'uploading')) return setError('Wait for the attachments to finish uploading.')
      if (!to.length && !cc.length && !bcc.length) return setError('Add at least one recipient.')
      if (!subject.trim() && !confirm('Send without a subject?')) return
      await saving.current
      const r = await sendMail(draft(), { draftId, replyTo: init.replyTo, forwardOf: init.forwardOf, replacesMessageId: init.replacesMessageId })
      if (!r.ok) return setError(r.error)
      onSent()
    })

  const close = async () => {
    changed.current = changed.current || Boolean(editor.current?.isDirty())
    const hasContent = to.length || cc.length || subject.trim() || (editor.current?.getMarkdown() ?? '').trim() || atts.length
    if (!hasContent) {
      if (draftId) await discardMailDraft(draftId)
      return onClose()
    }
    const id = await saveDraft()
    if (id) await keepMailDraft(id, init.replacesMessageId ?? null)
    onClose(id ? 'Saved to Drafts.' : undefined)
  }

  const discard = async () => {
    if (!confirm('Discard this message?')) return
    await saving.current
    if (draftId) await discardMailDraft(draftId)
    onClose('Message discarded.')
  }

  return (
    <Modal
      title={init.title}
      onClose={close}
      width={760}
      className="mail-compose"
      footer={
        <>
          <span className="muted small mail-compose-status" suppressHydrationWarning>
            {savedAt ? 'Draft saved' : ''}
          </span>
          <button className="icon-btn" title="Discard" aria-label="Discard" onClick={discard}>
            <Icon name="trash" />
          </button>
          <button className="btn btn-primary" onClick={send} disabled={sending}>
            <Icon name="send" /> {sending ? 'Sending…' : 'Send'}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <div className="mail-compose-from muted small">
        From <strong>{account.name ? `${account.name} <${account.email}>` : account.email}</strong>
      </div>
      <div className="mail-compose-row">
        <RecipientInput label="To" value={to} onChange={setTo} autoFocus={!init.to.length} />
        {!showCc && (
          <button className="link-btn small" onClick={() => setShowCc(true)}>
            Cc / Bcc
          </button>
        )}
      </div>
      {showCc && (
        <>
          <RecipientInput label="Cc" value={cc} onChange={setCc} />
          <RecipientInput label="Bcc" value={bcc} onChange={setBcc} />
        </>
      )}
      <input className="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" maxLength={998} />
      <div className="mail-editor">
        <RichEditor
          ref={editor}
          initialMarkdown=""
          initialHtml={init.html}
          variant="compact"
          placeholder="Write your message…"
          autoFocus={init.to.length > 0}
          onDirtyChange={() => {
            changed.current = true
          }}
          onSubmit={send}
        />
      </div>
      <div className="mail-compose-atts">
        {atts.map((a) => (
          <span key={a.key} className={`mail-att-chip${a.status === 'error' ? ' is-error' : ''}`} title={a.error}>
            <Icon name="paperclip" size={14} />
            <span className="mail-att-name">{a.name}</span>
            <span className="muted small">{a.status === 'uploading' ? `${Math.round((a.progress ?? 0) * 100)}%` : a.status === 'error' ? 'Failed' : fmtSize(a.size)}</span>
            <button aria-label={`Remove ${a.name}`} onClick={() => setAtts((x) => x.filter((y) => y.key !== a.key))}>
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        <button className="btn btn-subtle btn-sm" onClick={() => fileInput.current?.click()}>
          <Icon name="paperclip" /> Attach
        </button>
        <button className="btn btn-subtle btn-sm" onClick={() => setPicking(true)}>
          <Icon name="folder" /> From Files
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) upload(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {picking && (
        <FilesPicker
          onClose={() => setPicking(false)}
          onPick={(files) => {
            setPicking(false)
            setAtts((a) => [...a, ...files.map((f) => ({ key: `c${f.path}`, name: f.name, size: f.size, status: 'ready' as const, att: { type: 'cloud' as const, fileName: f.path } }))])
          }}
        />
      )}
    </Modal>
  )
}
