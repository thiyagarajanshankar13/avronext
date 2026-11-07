'use client'
import { useEffect, useRef, useState } from 'react'
import { loadMessage, saveAttachmentToFiles } from '@/app/(app)/mail/actions'
import type { Mailbox, MailMessage, MailSummary } from '@/lib/nextcloud/mail'
import { fmtSize } from '../attachments/upload'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { Menu } from '../Menu'

export type ReplyMode = 'reply' | 'replyAll' | 'forward'

const fullDate = (s: number) => new Date(s * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const who = (a?: { label: string; email: string }) => (a ? a.label || a.email : 'Unknown sender')
const list = (xs: { label: string; email: string }[]) => xs.map((a) => (a.label && a.label !== a.email ? `${a.label} <${a.email}>` : a.email)).join(', ')

/** The message's HTML in a locked-down frame (no scripts), sized to its content; remote images on request. */
function MailHtml({ id }: { id: number }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [images, setImages] = useState(false)
  const [blocked, setBlocked] = useState(0)
  const [height, setHeight] = useState(120)
  useEffect(() => {
    setImages(false)
  }, [id])
  const measure = () => {
    const doc = frame.current?.contentDocument
    if (doc?.documentElement) setHeight(Math.max(60, doc.documentElement.scrollHeight + 4))
  }
  return (
    <>
      {blocked > 0 && !images && (
        <div className="mail-images-note">
          <Icon name="image" size={14} /> Remote images are hidden to protect your privacy.
          <button className="link-btn small" onClick={() => setImages(true)}>
            Show images
          </button>
        </div>
      )}
      <iframe
        ref={frame}
        className="mail-html"
        title="Message"
        src={`/api/mail/html/${id}${images ? '?images=1' : ''}`}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        style={{ height }}
        onLoad={() => {
          const doc = frame.current?.contentDocument
          if (!doc) return
          setBlocked(doc.querySelectorAll('img[data-avn-blocked]').length)
          measure()
          doc.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure))
          new ResizeObserver(measure).observe(doc.body)
        }}
      />
    </>
  )
}

function Attachments({ message, onNote }: { message: MailMessage; onNote: (t: string) => void }) {
  const files = message.attachments.filter((a) => !a.cid || !message.hasHtmlBody)
  if (!files.length) return null
  const base = (a: (typeof files)[number]) => `/api/mail/attachment/${message.databaseId}/${encodeURIComponent(a.id)}?name=${encodeURIComponent(a.fileName)}`
  return (
    <ul className="mail-attachments">
      {files.map((a) => (
        <li key={a.id} className="mail-attachment">
          {a.isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${base(a)}&inline`} alt="" loading="lazy" />
          ) : (
            <span className="mail-attachment-icon">
              <Icon name="paperclip" />
            </span>
          )}
          <div className="mail-attachment-info">
            <span className="mail-attachment-name" title={a.fileName}>
              {a.fileName}
            </span>
            <span className="muted small">{fmtSize(a.size)}</span>
          </div>
          <Menu align="right" label={`Actions for ${a.fileName}`} trigger={<span className="icon-btn icon-btn-sm"><Icon name="more" /></span>}>
            {(close) => (
              <>
                {(a.isImage || /^(application\/pdf|video\/|audio\/)/.test(a.mime)) && (
                  <a className="menu-item" href={`${base(a)}&view`} target="_blank" rel="noopener noreferrer" onClick={close}>
                    <Icon name="external" /> Open
                  </a>
                )}
                <a className="menu-item" href={base(a)} onClick={close}>
                  <Icon name="download" /> Download
                </a>
                <button
                  className="menu-item"
                  onClick={async () => {
                    close()
                    const r = await saveAttachmentToFiles(message.databaseId, a.id, '/')
                    onNote(r.ok ? `Saved ${a.fileName} to My files.` : r.error)
                  }}
                >
                  <Icon name="folder" /> Save to Files
                </button>
              </>
            )}
          </Menu>
        </li>
      ))}
    </ul>
  )
}

function Body({ message, onNote }: { message: MailMessage; onNote: (t: string) => void }) {
  return (
    <div className="mail-body">
      {message.hasHtmlBody ? <MailHtml id={message.databaseId} /> : <div className="mail-plain">{message.body}</div>}
      <Attachments message={message} onNote={onNote} />
    </div>
  )
}

/** One earlier message of the conversation: collapsed to a line until clicked. */
function ThreadItem({ summary, onNote }: { summary: MailSummary; onNote: (t: string) => void }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<MailMessage | null>(null)
  return (
    <article className={`mail-thread-item${open ? ' is-open' : ''}`}>
      <button
        className="mail-thread-head"
        onClick={() => {
          setOpen(!open)
          if (!message) loadMessage(summary.databaseId).then((r) => r.ok && setMessage(r.data.message))
        }}
      >
        <Avatar uid={summary.from[0]?.email ?? '?'} name={who(summary.from[0])} size={24} />
        <strong>{who(summary.from[0])}</strong>
        <span className="mail-thread-preview muted">{open ? '' : summary.previewText}</span>
        <span className="muted small">{fullDate(summary.dateInt)}</span>
      </button>
      {open && (message ? <Body message={message} onNote={onNote} /> : <p className="muted small">Loading…</p>)}
    </article>
  )
}

export function MessageView({
  id,
  mailboxes,
  isDraftFolder,
  onBack,
  onAction,
  onNote,
}: {
  id: number
  mailboxes: Mailbox[]
  isDraftFolder: boolean
  onBack: () => void
  onAction: (a: { kind: 'reply'; mode: ReplyMode; message: MailMessage } | { kind: 'edit'; message: MailMessage } | { kind: 'flag'; flagged: boolean } | { kind: 'unread' } | { kind: 'move'; to: number } | { kind: 'delete' }) => void
  onNote: (t: string) => void
}) {
  const [data, setData] = useState<{ message: MailMessage; thread: MailSummary[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setData(null)
    setError(null)
    let stale = false
    loadMessage(id).then((r) => {
      if (stale) return
      if (r.ok) setData(r.data)
      // Nextcloud answers a vague 500 both for a message deleted elsewhere and for a busy or unreachable
      // mail server, so don't drop it from the list here: the folder sync removes messages that are gone.
      else
        setError(
          /could not load|server error|not found|forbidden/i.test(r.error)
            ? 'Couldn’t open this message. It may have been moved or deleted, or the mail server is busy.'
            : r.error,
        )
    })
    return () => {
      stale = true
    }
  }, [id, attempt])

  if (error)
    return (
      <div className="mail-reader-empty">
        <div className="banner banner-error">{error}</div>
        <button className="btn btn-default btn-sm" onClick={() => setAttempt((n) => n + 1)}>
          <Icon name="refresh" /> Try again
        </button>
      </div>
    )
  if (!data) return <div className="mail-reader-empty muted">Loading…</div>
  const m = data.message
  const earlier = data.thread.filter((t) => t.databaseId !== m.databaseId && t.dateInt <= m.dateInt).sort((a, b) => a.dateInt - b.dateInt)
  const moveTargets = mailboxes.filter((b) => b.databaseId !== m.mailboxId && !b.attributes?.includes('\\noselect'))
  const flagged = m.flags.flagged
  return (
    <div className="mail-reader-inner">
      <div className="mail-reader-bar">
        <button className="icon-btn mail-back" aria-label="Back to messages" onClick={onBack}>
          <Icon name="arrowBack" />
        </button>
        {isDraftFolder ? (
          <button className="btn btn-primary btn-sm" onClick={() => onAction({ kind: 'edit', message: m })}>
            <Icon name="edit" /> Edit draft
          </button>
        ) : (
          <>
            <button className="btn btn-default btn-sm" onClick={() => onAction({ kind: 'reply', mode: 'reply', message: m })} title="Reply (r)">
              <Icon name="reply" /> <span className="hide-sm">Reply</span>
            </button>
            <button className="btn btn-default btn-sm" onClick={() => onAction({ kind: 'reply', mode: 'replyAll', message: m })} title="Reply all (a)">
              <Icon name="replyAll" /> <span className="hide-sm">Reply all</span>
            </button>
            <button className="btn btn-default btn-sm" onClick={() => onAction({ kind: 'reply', mode: 'forward', message: m })} title="Forward (f)">
              <Icon name="forward" /> <span className="hide-sm">Forward</span>
            </button>
          </>
        )}
        <span className="mail-reader-spacer" />
        <button className={`icon-btn${flagged ? ' is-starred' : ''}`} aria-label={flagged ? 'Unstar' : 'Star'} title="Star (s)" onClick={() => onAction({ kind: 'flag', flagged: !flagged })}>
          <Icon name={flagged ? 'star' : 'starOutline'} />
        </button>
        <button className="icon-btn" aria-label="Mark as unread" title="Mark as unread (u)" onClick={() => onAction({ kind: 'unread' })}>
          <Icon name="mailOutline" />
        </button>
        <Menu align="right" label="Move to" trigger={<span className="icon-btn" title="Move to…"><Icon name="move" /></span>}>
          {(close) => (
            <>
              <div className="menu-heading">Move to</div>
              {moveTargets.map((b) => (
                <button
                  key={b.databaseId}
                  className="menu-item"
                  onClick={() => {
                    close()
                    onAction({ kind: 'move', to: b.databaseId })
                  }}
                >
                  {(b.specialRole && { inbox: 'Inbox', drafts: 'Drafts', sent: 'Sent', archive: 'Archive', junk: 'Junk', trash: 'Trash' }[b.specialRole]) || b.displayName}
                </button>
              ))}
            </>
          )}
        </Menu>
        <button className="icon-btn" aria-label="Delete" title="Delete (#)" onClick={() => onAction({ kind: 'delete' })}>
          <Icon name="trash" />
        </button>
      </div>
      <h1 className="mail-reader-subject">{m.subject || '(no subject)'}</h1>
      {earlier.length > 0 && (
        <div className="mail-thread">
          {earlier.map((t) => (
            <ThreadItem key={t.databaseId} summary={t} onNote={onNote} />
          ))}
        </div>
      )}
      <article className="mail-message">
        <header className="mail-message-head">
          <Avatar uid={m.from[0]?.email ?? '?'} name={who(m.from[0])} size={36} />
          <div className="mail-message-who">
            <div>
              <strong>{who(m.from[0])}</strong> {m.from[0]?.label && m.from[0].label !== m.from[0].email && <span className="muted small">&lt;{m.from[0].email}&gt;</span>}
            </div>
            <div className="muted small mail-message-to">
              To {list(m.to) || '(no recipients)'}
              {m.cc.length > 0 && <> · Cc {list(m.cc)}</>}
            </div>
          </div>
          <span className="muted small mail-message-date">{fullDate(m.dateInt)}</span>
        </header>
        <Body message={m} onNote={onNote} />
      </article>
    </div>
  )
}
