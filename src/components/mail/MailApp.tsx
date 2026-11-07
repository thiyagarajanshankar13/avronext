'use client'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteMessages,
  ensureFolders,
  loadMailboxes,
  loadMessages,
  mailUnreadCount,
  markFolderRead,
  moveMessages,
  primeFolder,
  refreshMailbox,
  removeMailbox,
  saveSignature,
  setMessageFlags,
  syncFolder,
} from '@/app/(app)/mail/actions'
import { FAB_EVENT } from '@/lib/fab'
import type { Mailbox, MailMessage, MailSummary } from '@/lib/nextcloud/mail'
import { Icon, type IconName } from '../Icon'
import { Menu } from '../Menu'
import { Modal } from '../Modal'
import { MAIL_UNREAD_EVENT } from '../TopNav'
import { Compose, type ComposeInit } from './Compose'
import { ConnectMailbox } from './ConnectMailbox'
import { MessageView, type ReplyMode } from './MessageView'

export type MailAccountLite = { id: number; name: string; email: string; signature: string | null; username: string; ours: boolean }

const ROLE_ORDER = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash']
const ROLE_ICON: Record<string, IconName> = { inbox: 'inbox', drafts: 'drafts', sent: 'send', archive: 'archive', junk: 'report', trash: 'trash' }
const PAGE = 30
/** Friendly names for the special folders (servers call the inbox "INBOX"). */
const ROLE_NAME: Record<string, string> = { inbox: 'Inbox', drafts: 'Drafts', sent: 'Sent', archive: 'Archive', junk: 'Junk', trash: 'Trash' }
const folderName = (b: Mailbox) => (b.specialRole && ROLE_NAME[b.specialRole]) || b.displayName

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const textToHtml = (t: string) => esc(t).replace(/\n/g, '<br>')
const who = (a?: { label: string; email: string }) => (a ? a.label || a.email : '')

function shortDate(s: number) {
  const d = new Date(s * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

function sortFolders(boxes: Mailbox[]) {
  const rank = (b: Mailbox) => {
    const i = ROLE_ORDER.indexOf(b.specialRole ?? '')
    return i < 0 ? ROLE_ORDER.length : i
  }
  return [...boxes].filter((b) => !b.attributes?.includes('\\noselect')).sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName))
}

const signatureHtml = (sig: string | null) => (sig?.trim() ? `<p></p><p>-- <br>${textToHtml(sig.trim())}</p>` : '')
/** Start of a reply or forward: an empty line to write on (the cursor starts there), then the signature. */
const replyStart = (sig: string | null) => signatureHtml(sig) || '<p></p>'

/** Quote of the original under "On …, … wrote:" (remote images and inline images dropped). */
function quote(m: MailMessage) {
  const body = m.hasHtmlBody ? m.body.replace(/<img\b[^>]*>/gi, '') : textToHtml(m.body)
  const when = new Date(m.dateInt * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return `<p>On ${esc(when)}, ${esc(who(m.from[0]) || 'someone')} wrote:</p><blockquote>${body}</blockquote>`
}

const prefixed = (prefix: string, subject: string) => (new RegExp(`^${prefix}:`, 'i').test(subject.trim()) ? subject : `${prefix}: ${subject}`)

export function MailApp({
  accounts,
  initialAccountId,
  initialMailboxes,
  me,
  server,
  usernameTemplate,
}: {
  accounts: MailAccountLite[]
  initialAccountId: number
  initialMailboxes: Mailbox[]
  me: { name: string; email: string; userId: string }
  server: string
  usernameTemplate: string
}) {
  const router = useRouter()
  const [accountId, setAccountId] = useState(initialAccountId)
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0]
  const [mailboxes, setMailboxes] = useState(() => sortFolders(initialMailboxes))
  const [mailboxId, setMailboxId] = useState<number>(() => {
    const fromUrl = Number(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('folder'))
    return initialMailboxes.find((b) => b.databaseId === fromUrl)?.databaseId ?? initialMailboxes.find((b) => b.specialRole === 'inbox')?.databaseId ?? initialMailboxes[0]?.databaseId
  })
  const [messages, setMessages] = useState<MailSummary[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [compose, setCompose] = useState<ComposeInit | null>(null)
  const [dialog, setDialog] = useState<null | 'signature' | 'reconnect' | 'add'>(null)
  const [signature, setSignature] = useState(account?.signature ?? '')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The open folder is being downloaded into Nextcloud Mail for the first time. */
  const [preparing, setPreparing] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)

  const mailbox = mailboxes.find((b) => b.databaseId === mailboxId)
  const isDrafts = mailbox?.specialRole === 'drafts'

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 4000)
    return () => clearTimeout(t)
  }, [note])

  const reportUnread = () => mailUnreadCount().then((r) => r.ok && window.dispatchEvent(new CustomEvent(MAIL_UNREAD_EVENT, { detail: r.data })))

  const refreshFolders = useCallback(async () => {
    const r = await loadMailboxes(accountId)
    if (r.ok) setMailboxes(sortFolders(r.data))
  }, [accountId])

  // Folder (and search) changes: first page.
  useEffect(() => {
    if (!mailboxId) return
    let stale = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let priming = false
    setMessages(null)
    setError(null)
    setPreparing(false)
    // First visit: Nextcloud Mail downloads the whole folder, which takes minutes for a big mailbox.
    // Keep that going in the background (one request at a time, again while it says "more") and show
    // the list as soon as Nextcloud has it.
    const prime = async () => {
      if (priming) return
      priming = true
      for (let i = 0; i < 50 && !stale; i++) {
        const p = await primeFolder(mailboxId)
        if (stale) break
        if (!p.ok) {
          setError(p.error)
          break
        }
        if (p.data !== 'more') break
      }
      priming = false
    }
    const load = () =>
      loadMessages(mailboxId, { filter: activeQuery || null }).then((r) => {
        if (stale) return
        if (!r.ok) return setError(r.error)
        if (r.data === null) {
          setPreparing(true)
          void prime()
          timer = setTimeout(load, 4000)
          return
        }
        setPreparing(false)
        setMessages(r.data)
        setHasMore(r.data.length >= PAGE)
        // The fetch may have brought new mail: update the counts too.
        loadMailboxes(accountId).then((b) => !stale && b.ok && setMailboxes(sortFolders(b.data)))
        reportUnread()
      })
    void load()
    const url = new URL(window.location.href)
    url.searchParams.set('folder', String(mailboxId))
    window.history.replaceState(window.history.state, '', url)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [mailboxId, activeQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mailboxes added in Nextcloud Mail itself may lack Sent / Drafts / Trash: set them up once.
  useEffect(() => {
    ensureFolders(accountId).then((r) => {
      if (r.ok) void refreshFolders()
    })
  }, [accountId, refreshFolders])

  // Keep Sent fetched too, so conversations show your own replies.
  const sentId = mailboxes.find((b) => b.specialRole === 'sent')?.databaseId
  useEffect(() => {
    if (!sentId || sentId === mailboxId) return
    refreshMailbox(sentId)
    const t = setInterval(() => refreshMailbox(sentId), 120_000)
    return () => clearInterval(t)
  }, [sentId, mailboxId])

  // New mail: sync the open folder every 30 s and when the tab comes back.
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  useEffect(() => {
    if (!mailboxId) return
    const tick = async () => {
      const current = messagesRef.current
      if (!current) return
      const r = await syncFolder(
        mailboxId,
        current.map((m) => m.databaseId),
        activeQuery || null,
      )
      if (!r.ok) return
      const { newMessages, changedMessages, vanishedMessages } = r.data
      if (!newMessages.length && !changedMessages.length && !vanishedMessages.length) return
      setMessages((list) => {
        if (!list) return list
        const gone = new Set(vanishedMessages)
        const changed = new Map(changedMessages.map((m) => [m.databaseId, m]))
        const known = new Set(list.map((m) => m.databaseId))
        const fresh = newMessages.filter((m) => !known.has(m.databaseId))
        return [...fresh, ...list.filter((m) => !gone.has(m.databaseId)).map((m) => changed.get(m.databaseId) ?? m)].sort((a, b) => b.dateInt - a.dateInt)
      })
      refreshFolders()
      reportUnread()
    }
    const t = setInterval(tick, 30_000)
    const onVisible = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [mailboxId, activeQuery, refreshFolders])

  const loadMore = async () => {
    if (!messages?.length || loadingMore) return
    setLoadingMore(true)
    const r = await loadMessages(mailboxId, { cursor: messages[messages.length - 1].dateInt, filter: activeQuery || null })
    setLoadingMore(false)
    if (!r.ok) return setError(r.error)
    const page = r.data ?? []
    const known = new Set(messages.map((m) => m.databaseId))
    setMessages([...messages, ...page.filter((m) => !known.has(m.databaseId))])
    setHasMore(page.length >= PAGE)
  }

  const patchMessage = (id: number, flags: Partial<MailSummary['flags']>) =>
    setMessages((list) => list?.map((m) => (m.databaseId === id ? { ...m, flags: { ...m.flags, ...flags } } : m)) ?? list)
  const bumpUnread = (delta: number) => setMailboxes((bs) => bs.map((b) => (b.databaseId === mailboxId ? { ...b, unread: Math.max(0, (b.unread ?? 0) + delta) } : b)))

  const open = (m: MailSummary) => {
    setSelected(m.databaseId)
    if (!m.flags.seen) {
      patchMessage(m.databaseId, { seen: true })
      bumpUnread(-1)
      setMessageFlags(m.databaseId, { seen: true }).then(reportUnread)
    }
  }

  const removeFromList = (id: number) => {
    const list = messages ?? []
    const i = list.findIndex((m) => m.databaseId === id)
    const next = list[i + 1] ?? list[i - 1]
    setMessages(list.filter((m) => m.databaseId !== id))
    setSelected((s) => (s === id ? (next && window.matchMedia('(min-width: 761px)').matches ? next.databaseId : null) : s))
  }

  const act = async (id: number, a: Parameters<Parameters<typeof MessageView>[0]['onAction']>[0]) => {
    const summary = messages?.find((m) => m.databaseId === id)
    if (a.kind === 'reply') return startReply(a.mode, a.message)
    if (a.kind === 'edit') return editDraft(a.message)
    if (a.kind === 'flag') {
      patchMessage(id, { flagged: a.flagged })
      const r = await setMessageFlags(id, { flagged: a.flagged })
      if (!r.ok) setNote(r.error)
      return
    }
    if (a.kind === 'unread') {
      patchMessage(id, { seen: false })
      bumpUnread(1)
      setSelected(null)
      await setMessageFlags(id, { seen: false })
      return reportUnread()
    }
    if (a.kind === 'move') {
      removeFromList(id)
      const r = await moveMessages([id], a.to)
      setNote(r.ok ? `Moved to ${(() => { const t = mailboxes.find((b) => b.databaseId === a.to); return t ? folderName(t) : 'folder' })()}.` : r.error)
      return refreshFolders()
    }
    if (a.kind === 'delete') {
      removeFromList(id)
      const r = await deleteMessages([id])
      setNote(r.ok ? (mailbox?.specialRole === 'trash' ? 'Deleted for good.' : 'Moved to Trash.') : r.error)
      if (summary && !summary.flags.seen) reportUnread()
      return refreshFolders()
    }
  }

  const newMessage = useCallback(() => {
    setCompose({ title: 'New message', to: [], cc: [], subject: '', html: signatureHtml(signature) })
  }, [signature])

  const startReply = (mode: ReplyMode, m: MailMessage) => {
    const mine = (e: string) => e.toLowerCase() === account?.email.toLowerCase()
    if (mode === 'forward') {
      setCompose({
        title: 'Forward',
        to: [],
        cc: [],
        subject: prefixed('Fwd', m.subject),
        html: replyStart(signature) + `<p>---------- Forwarded message ----------</p>` + quote(m),
        attachments: m.attachments
          .filter((a) => !a.cid)
          .map((a) => ({ name: a.fileName, size: a.size, att: { type: 'message-attachment' as const, mailboxId: m.mailboxId, uid: m.uid, id: a.id, fileName: a.fileName } })),
        forwardOf: m.databaseId,
      })
      return
    }
    const replyTo = m.replyTo?.length ? m.replyTo : m.from
    const to = mode === 'replyAll' ? [...replyTo, ...m.to].filter((a, i, all) => !mine(a.email) && all.findIndex((b) => b.email === a.email) === i) : replyTo
    const cc = mode === 'replyAll' ? m.cc.filter((a) => !mine(a.email) && !to.some((t) => t.email === a.email)) : []
    setCompose({
      title: mode === 'replyAll' ? 'Reply all' : 'Reply',
      to: to.length ? to : replyTo,
      cc,
      subject: prefixed('Re', m.subject),
      html: replyStart(signature) + quote(m),
      inReplyToMessageId: m.messageId,
      replyTo: m.databaseId,
    })
  }

  const editDraft = (m: MailMessage) =>
    setCompose({
      title: 'Edit draft',
      to: m.to,
      cc: m.cc,
      bcc: m.bcc,
      subject: m.subject,
      html: m.hasHtmlBody ? m.body : textToHtml(m.body),
      replacesMessageId: m.databaseId,
    })

  // The phone's + button.
  useEffect(() => {
    const onFab = (e: Event) => (e as CustomEvent).detail === 'mail' && newMessage()
    window.addEventListener(FAB_EVENT, onFab)
    return () => window.removeEventListener(FAB_EVENT, onFab)
  }, [newMessage])

  // Keyboard: j/k move, Enter open, c compose, r/a/f reply, s star, u unread, # delete, / search.
  const currentRef = useRef<{ list: MailSummary[]; selected: number | null }>({ list: [], selected: null })
  currentRef.current = { list: messages ?? [], selected }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (compose || dialog || e.metaKey || e.ctrlKey || e.altKey) return
      if (t.closest('input, textarea, select, [contenteditable="true"], .modal')) return
      const { list, selected: sel } = currentRef.current
      const i = list.findIndex((m) => m.databaseId === sel)
      const go = (j: number) => {
        const m = list[Math.max(0, Math.min(list.length - 1, j))]
        if (m) {
          open(m)
          document.querySelector(`[data-mail-id="${m.databaseId}"]`)?.scrollIntoView({ block: 'nearest' })
        }
      }
      if (e.key === 'j' || e.key === 'ArrowDown') (e.preventDefault(), go(i + 1))
      else if (e.key === 'k' || e.key === 'ArrowUp') (e.preventDefault(), go(i - 1))
      else if (e.key === 'c') (e.preventDefault(), newMessage())
      else if (e.key === '/') (e.preventDefault(), searchInput.current?.focus())
      else if (sel && e.key === 's') act(sel, { kind: 'flag', flagged: !list[i]?.flags.flagged })
      else if (sel && e.key === 'u') act(sel, { kind: 'unread' })
      else if (sel && (e.key === '#' || e.key === 'Delete')) act(sel, { kind: 'delete' })
      else if (sel && (e.key === 'r' || e.key === 'a' || e.key === 'f')) {
        e.preventDefault()
        document.querySelector<HTMLButtonElement>(`.mail-reader-bar [title^="${e.key === 'r' ? 'Reply (' : e.key === 'a' ? 'Reply all' : 'Forward'}"]`)?.click()
      } else if (e.key === 'Escape' && sel) setSelected(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const switchAccount = async (id: number) => {
    setAccountId(id)
    setSelected(null)
    const acc = accounts.find((a) => a.id === id)
    setSignature(acc?.signature ?? '')
    const r = await loadMailboxes(id)
    if (!r.ok) return setError(r.error)
    const boxes = sortFolders(r.data)
    setMailboxes(boxes)
    setMailboxId(boxes.find((b) => b.specialRole === 'inbox')?.databaseId ?? boxes[0]?.databaseId)
  }

  const folders = useMemo(() => mailboxes, [mailboxes])

  return (
    <div className={`with-sidebar mail-app${selected ? ' has-reader' : ''}`}>
      <aside className="sidebar mail-sidebar">
        <div className="sidebar-inner">
          <div className="sidebar-head mail-account-head">
            <span className="project-avatar mail-account-avatar">
              <Icon name="mail" />
            </span>
            <div className="mail-account-who">
              <div className="sidebar-title" title={account?.email}>
                {account?.name || account?.email}
              </div>
              <div className="sidebar-sub">{account?.email}</div>
            </div>
            <Menu align="right" label="Mailbox settings" trigger={<span className="icon-btn icon-btn-sm"><Icon name="settings" /></span>}>
              {(close) => (
                <>
                  {accounts.length > 1 && (
                    <>
                      <div className="menu-heading">Mailboxes</div>
                      {accounts.map((a) => (
                        <button key={a.id} className="menu-item" onClick={() => (close(), switchAccount(a.id))}>
                          {a.id === accountId ? <Icon name="check" /> : <Icon name="mailOutline" />} {a.email}
                        </button>
                      ))}
                      <div className="menu-sep" />
                    </>
                  )}
                  <button className="menu-item" onClick={() => (close(), setDialog('signature'))}>
                    <Icon name="edit" /> Signature
                  </button>
                  {account?.ours && (
                    <button className="menu-item" onClick={() => (close(), setDialog('reconnect'))}>
                      <Icon name="refresh" /> Reconnect (new password)
                    </button>
                  )}
                  <button className="menu-item" onClick={() => (close(), setDialog('add'))}>
                    <Icon name="plus" /> Add another mailbox
                  </button>
                  <div className="menu-sep" />
                  <button
                    className="menu-item menu-item-danger"
                    onClick={async () => {
                      close()
                      if (!confirm(`Remove ${account?.email} from Mail? Nothing is deleted on the mail server; you can connect it again later.`)) return
                      const r = await removeMailbox(accountId)
                      if (!r.ok) return setNote(r.error)
                      router.refresh()
                    }}
                  >
                    <Icon name="trash" /> Remove this mailbox
                  </button>
                </>
              )}
            </Menu>
          </div>
          <button className="btn btn-primary mail-compose-btn" onClick={newMessage} title="New message (c)">
            <Icon name="edit" /> New message
          </button>
          {folders.map((b) => (
            <button
              key={b.databaseId}
              className={`side-link mail-folder${b.databaseId === mailboxId ? ' is-active' : ''}`}
              onClick={() => {
                setSelected(null)
                setQuery('')
                setActiveQuery('')
                setMailboxId(b.databaseId)
              }}
            >
              <Icon name={ROLE_ICON[b.specialRole ?? ''] ?? 'folder'} />
              <span className="mail-folder-name">{folderName(b)}</span>
              {b.unread > 0 && b.specialRole !== 'sent' && b.specialRole !== 'trash' && <span className="mail-count">{b.unread}</span>}
            </button>
          ))}
        </div>
      </aside>

      <section className="mail-list" aria-label="Messages">
        <form
          className="mail-search"
          onSubmit={(e) => {
            e.preventDefault()
            setSelected(null)
            setActiveQuery(query.trim())
          }}
        >
          <Icon name="search" />
          <input ref={searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${mailbox ? folderName(mailbox) : 'mail'}`} aria-label="Search mail" />
          {activeQuery && (
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              aria-label="Clear search"
              onClick={() => {
                setQuery('')
                setActiveQuery('')
              }}
            >
              <Icon name="close" />
            </button>
          )}
          <Menu align="right" label="Folder actions" trigger={<span className="icon-btn icon-btn-sm"><Icon name="more" /></span>}>
            {(close) => (
              <button
                className="menu-item"
                onClick={async () => {
                  close()
                  await markFolderRead(mailboxId)
                  setMessages((l) => l?.map((m) => ({ ...m, flags: { ...m.flags, seen: true } })) ?? l)
                  refreshFolders()
                  reportUnread()
                }}
              >
                <Icon name="check" /> Mark all as read
              </button>
            )}
          </Menu>
        </form>
        {error && <div className="banner banner-error">{error}</div>}
        {messages === null && !error && !preparing && <div className="mail-list-empty muted">Loading…</div>}
        {messages === null && !error && preparing && (
          <div className="mail-list-empty mail-preparing">
            <span className="spinner" aria-hidden="true" />
            <strong>Getting your mail ready</strong>
            <span className="muted small">This is the first time this folder is opened, so Nextcloud is downloading it from the mail server. A big mailbox can take a few minutes; your messages appear here as soon as they’re in.</span>
          </div>
        )}
        {messages?.length === 0 && <div className="mail-list-empty muted">{activeQuery ? 'No messages match your search.' : 'No messages here.'}</div>}
        <ul className="mail-items">
          {messages?.map((m) => {
            const other = mailbox?.specialRole === 'sent' || mailbox?.specialRole === 'drafts' ? m.to : m.from
            return (
              <li key={m.databaseId}>
                <button
                  data-mail-id={m.databaseId}
                  className={`mail-item${m.databaseId === selected ? ' is-active' : ''}${m.flags.seen ? '' : ' is-unread'}`}
                  onClick={() => open(m)}
                >
                  <span className="mail-item-top">
                    <span className="mail-item-from">{other.map(who).join(', ') || '(no one)'}</span>
                    {m.flags.flagged && <Icon name="star" size={13} className="mail-item-star" />}
                    {m.flags.hasAttachments && <Icon name="paperclip" size={13} />}
                    <span className="mail-item-date" suppressHydrationWarning>
                      {shortDate(m.dateInt)}
                    </span>
                  </span>
                  <span className="mail-item-subject">{m.subject || '(no subject)'}</span>
                  <span className="mail-item-preview">{m.previewText}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {hasMore && (
          <button className="btn btn-subtle mail-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>

      <section className="mail-reader" aria-label="Message">
        {selected ? (
          <MessageView id={selected} mailboxes={mailboxes} isDraftFolder={isDrafts} onBack={() => setSelected(null)} onAction={(a) => act(selected, a)}
            onNote={setNote}
          />
        ) : (
          <div className="mail-reader-empty">
            <Icon name="mailOutline" size={40} />
            <p className="muted">Select a message to read it.</p>
            <p className="muted small mail-keys">
              Shortcuts: <kbd>c</kbd> new · <kbd>j</kbd>/<kbd>k</kbd> next/previous · <kbd>r</kbd> reply · <kbd>a</kbd> reply all · <kbd>f</kbd> forward · <kbd>s</kbd> star · <kbd>#</kbd> delete · <kbd>/</kbd> search
            </p>
          </div>
        )}
      </section>

      {compose && account && (
        <Compose
          account={{ id: account.id, email: account.email, name: account.name }}
          init={compose}
          onClose={(n) => {
            setCompose(null)
            if (n) setNote(n)
            if (isDrafts) refreshFolders()
          }}
          onSent={() => {
            setCompose(null)
            setNote('Message sent.')
            refreshFolders()
          }}
        />
      )}

      {dialog === 'signature' && (
        <Modal
          title="Signature"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button className="btn btn-subtle" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const r = await saveSignature(accountId, signature)
                  setNote(r.ok ? 'Signature saved.' : r.error)
                  setDialog(null)
                }}
              >
                Save
              </button>
            </>
          }
        >
          <p className="muted small">Added to the end of new messages, replies and forwards from {account?.email}.</p>
          <textarea className="mail-signature" value={signature} onChange={(e) => setSignature(e.target.value)} rows={6} maxLength={4000} placeholder={`${me.name}\n${account?.email}`} />
        </Modal>
      )}
      {(dialog === 'reconnect' || dialog === 'add') && (
        <Modal onClose={() => setDialog(null)} width={460}>
          <ConnectMailbox
            name={me.name}
            email={dialog === 'add' ? '' : me.email}
            usernameTemplate={usernameTemplate}
            userId={me.userId}
            server={server}
            reconnect={dialog === 'reconnect' && account ? { accountId: account.id, username: account.username, email: account.email } : undefined}
            onCancel={() => setDialog(null)}
            onDone={() => {
              setDialog(null)
              setNote(dialog === 'add' ? 'Mailbox added.' : 'Reconnected.')
              router.refresh()
            }}
          />
        </Modal>
      )}
      {note && (
        <div className="toast" role="status">
          {note}
        </div>
      )}
    </div>
  )
}
