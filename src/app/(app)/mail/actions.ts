'use server'

import { run } from '@/lib/actions'
import { mailServer } from '@/lib/env'
import { markdownToSafeHtml } from '@/lib/markdown.server'
import { listFolder } from '@/lib/nextcloud/files'
import * as mail from '@/lib/nextcloud/mail'
import type { Session } from '@/lib/session'

/** AvroNext Mail: everything goes through Nextcloud Mail (lib/nextcloud/mail.ts). */

const id = (n: unknown) => {
  const v = Number(n)
  if (!Number.isInteger(v) || v <= 0) throw new Error('Invalid id')
  return v
}
const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)
const validEmail = (e: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e)

/**
 * Search box text → Nextcloud Mail's filter: plain words match the subject, sender
 * or recipients; typed filters ("from:ann", "is:unread", "is:starred") pass through.
 */
function toFilter(text: string | null | undefined): string | null {
  const t = str(text, 200)
  if (!t) return null
  const words = t.split(/\s+/)
  const typed = words.filter((w) => /^[a-z]+:/i.test(w))
  const plain = words.filter((w) => !/^[a-z]+:/i.test(w)).join(' ')
  const parts = typed.map((w) => {
    const [k, ...v] = w.split(':')
    return `${k.toLowerCase()}:${encodeURIComponent(v.join(':'))}`
  })
  if (plain) {
    const q = encodeURIComponent(plain)
    parts.push(`subject:${q}`, `from:${q}`, `to:${q}`, 'match:anyof')
  }
  return parts.join(' ')
}

function guard() {
  if (!mailServer()) throw new Error('Mail isn’t set up on this server.')
}

/** Makes sure the account knows its Sent, Drafts and Trash folders (creating any the server doesn't have). */
async function settleFolders(s: Session, account: mail.MailAccount) {
  const boxes = await mail.listMailboxes(s, account.id)
  const byRole = (role: string) => boxes.find((b) => b.specialRole === role)
  const patch: Parameters<typeof mail.patchAccount>[2] = {}
  if (!account.sentMailboxId) {
    const sent = byRole('sent') ?? (await mail.createMailbox(s, account.id, 'Sent').catch(() => null))
    if (sent) patch.sentMailboxId = sent.databaseId
  }
  if (!account.draftsMailboxId) {
    const drafts = byRole('drafts') ?? (await mail.createMailbox(s, account.id, 'Drafts').catch(() => null))
    if (drafts) patch.draftsMailboxId = drafts.databaseId
  }
  if (!account.trashMailboxId) {
    const trash = byRole('trash') ?? (await mail.createMailbox(s, account.id, 'Trash').catch(() => null))
    if (trash) patch.trashMailboxId = trash.databaseId
  }
  if (Object.keys(patch).length) await mail.patchAccount(s, account.id, patch)
}

/** Opening Mail: give mailboxes added elsewhere their Sent / Drafts / Trash (needed to send, save drafts and delete). */
export async function ensureFolders(accountId: number) {
  return run(async (s) => {
    const account = (await mail.listAccounts(s)).find((a) => a.id === id(accountId))
    if (account && (!account.sentMailboxId || !account.draftsMailboxId || !account.trashMailboxId)) await settleFolders(s, account)
    return null
  })
}

export async function connectMailbox(input: { name: string; email: string; username: string; password: string }) {
  return run(async (s) => {
    guard()
    const email = str(input.email, 254).toLowerCase()
    if (!validEmail(email)) throw new Error('Enter your email address.')
    const username = str(input.username, 254)
    if (!username) throw new Error('Enter your mail username.')
    if (!input.password) throw new Error('Enter your mail password.')
    const account = await mail.createAccount(s, { name: str(input.name, 100) || s.displayName || email, email, username, password: String(input.password) })
    await settleFolders(s, account).catch((err) => console.error('[avronext] mail folders:', err))
    return { id: account.id }
  })
}

export async function reconnectMailbox(accountId: number, username: string, password: string) {
  return run(async (s) => {
    guard()
    const account = (await mail.listAccounts(s)).find((a) => a.id === id(accountId))
    if (!account) throw new Error('That mailbox no longer exists.')
    if (!password) throw new Error('Enter your mail password.')
    await mail.reconnectAccount(s, account, { username: str(username, 254) || account.imapUser, password: String(password) })
    return null
  })
}

/** Removes the mailbox from Nextcloud Mail (nothing is deleted on the mail server). */
export async function removeMailbox(accountId: number) {
  return run(async (s) => {
    await mail.deleteAccount(s, id(accountId))
    return null
  })
}

export async function saveSignature(accountId: number, signature: string) {
  return run(async (s) => {
    await mail.setSignature(s, id(accountId), str(signature, 4000) || null)
    return null
  })
}

export async function loadMailboxes(accountId: number) {
  return run((s) => mail.listMailboxes(s, id(accountId)))
}

export async function loadMessages(mailboxId: number, opts: { cursor?: number | null; filter?: string | null } = {}) {
  return run(async (s) => {
    // Opening a folder: fetch what arrived on the mail server first (Nextcloud Mail lists its own copy).
    if (!opts.cursor) await mail.syncMailbox(s, id(mailboxId)).catch(() => undefined)
    return mail.listMessages(s, id(mailboxId), { cursor: opts.cursor ?? null, filter: toFilter(opts.filter), limit: 30 })
  })
}

/** New, changed and removed messages since the client's copy (`ids` = what it shows). */
export async function syncFolder(mailboxId: number, ids: number[], query: string | null) {
  return run((s) => mail.syncMailbox(s, id(mailboxId), { ids: ids.slice(0, 500).map(Number).filter(Number.isInteger), query: toFilter(query) }))
}

/** Fetches a folder from the mail server in the background (e.g. Sent, so conversations include your replies). */
export async function refreshMailbox(mailboxId: number) {
  return run(async (s) => {
    try {
      await mail.syncMailbox(s, id(mailboxId))
    } catch (err) {
      if ((err as { code?: string }).code !== 'NOT_CACHED' && (err as { status?: number }).status !== 428) throw err
      await mail.syncMailbox(s, id(mailboxId), { init: true })
    }
    return null
  })
}

export async function loadMessage(messageId: number) {
  return run(async (s) => {
    const message = await mail.getMessage(s, id(messageId))
    const thread = await mail.getThread(s, message.databaseId).catch(() => [] as mail.MailSummary[])
    return { message, thread }
  })
}

export async function setMessageFlags(messageId: number, flags: Partial<Record<'seen' | 'flagged', boolean>>) {
  return run(async (s) => {
    const clean: Partial<Record<'seen' | 'flagged', boolean>> = {}
    if (typeof flags.seen === 'boolean') clean.seen = flags.seen
    if (typeof flags.flagged === 'boolean') clean.flagged = flags.flagged
    await mail.setFlags(s, id(messageId), clean)
    return null
  })
}

export async function moveMessages(messageIds: number[], destMailboxId: number) {
  return run(async (s) => {
    for (const m of messageIds.slice(0, 100)) await mail.moveMessage(s, id(m), id(destMailboxId))
    return null
  })
}

export async function deleteMessages(messageIds: number[]) {
  return run(async (s) => {
    for (const m of messageIds.slice(0, 100)) await mail.deleteMessage(s, id(m))
    return null
  })
}

export async function markFolderRead(mailboxId: number) {
  return run(async (s) => {
    await mail.markAllRead(s, id(mailboxId))
    return null
  })
}

export async function saveAttachmentToFiles(messageId: number, attachmentId: string, folder: string) {
  return run(async (s) => {
    const dir = '/' + str(folder, 1000).split('/').filter((p) => p && p !== '.' && p !== '..').join('/')
    await mail.saveAttachment(s, id(messageId), str(attachmentId, 100), dir)
    return dir
  })
}

export async function findRecipients(term: string) {
  return run(async (s) => (term.trim().length < 2 ? [] : (await mail.autocomplete(s, str(term, 100))).slice(0, 8)))
}

/** For "Attach from Files": a folder's contents. */
export async function browseFiles(path: string) {
  return run(async (s) => {
    const { folder, items } = await listFolder(s, path || '/')
    return { path: folder.path, items: items.map((i) => ({ path: i.path, name: i.name, isDir: i.isDir, size: i.size, mime: i.mime })) }
  })
}

/** Unread messages in every inbox (the nav badge). 0 when Mail is off or not set up. */
export async function mailUnreadCount() {
  return run(async (s) => {
    if (!mailServer()) return 0
    const accounts = await mail.listAccounts(s).catch(() => [])
    let n = 0
    for (const a of accounts) {
      const boxes = await mail.listMailboxes(s, a.id).catch(() => [])
      n += boxes.filter((b) => b.specialRole === 'inbox').reduce((t, b) => t + (b.unread || 0), 0)
    }
    return n
  })
}

// ---- Writing ----

export type Draft = {
  accountId: number
  to: mail.MailAddress[]
  cc: mail.MailAddress[]
  bcc: mail.MailAddress[]
  subject: string
  /** Markdown from the editor. */
  body: string
  attachments: mail.OutgoingAttachment[]
  inReplyToMessageId?: string | null
}

const addresses = (list: unknown) =>
  (Array.isArray(list) ? list : [])
    .slice(0, 100)
    .map((a: { label?: string; email?: string }) => ({ label: str(a?.label, 200), email: str(a?.email, 254) }))
    .filter((a) => a.email)

function outgoing(d: Draft): mail.Outgoing {
  const to = addresses(d.to)
  const cc = addresses(d.cc)
  const bcc = addresses(d.bcc)
  for (const a of [...to, ...cc, ...bcc]) if (!validEmail(a.email)) throw new Error(`“${a.email}” isn’t an email address.`)
  const markdown = String(d.body ?? '').slice(0, 1_000_000)
  const { html } = markdownToSafeHtml(markdown)
  return {
    accountId: id(d.accountId),
    subject: str(d.subject, 998),
    bodyHtml: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5">${html}</div>`,
    bodyPlain: markdown,
    to,
    cc,
    bcc,
    attachments: (Array.isArray(d.attachments) ? d.attachments : []).slice(0, 50),
    inReplyToMessageId: d.inReplyToMessageId ?? null,
  }
}

export async function sendMail(d: Draft, opts: { draftId?: number | null; replyTo?: number | null; forwardOf?: number | null; replacesMessageId?: number | null } = {}) {
  return run(async (s) => {
    guard()
    const m = outgoing(d)
    if (!m.to.length && !m.cc.length && !m.bcc.length) throw new Error('Add at least one recipient.')
    await mail.sendMessage(s, { ...m, draftId: opts.draftId ?? null })
    // Best effort: mark the original as answered / forwarded, and drop the draft it came from.
    if (opts.replyTo) await mail.setFlags(s, id(opts.replyTo), { answered: true }).catch(() => undefined)
    if (opts.forwardOf) await mail.setFlags(s, id(opts.forwardOf), { forwarded: true }).catch(() => undefined)
    if (opts.replacesMessageId) await mail.deleteMessage(s, id(opts.replacesMessageId)).catch(() => undefined)
    return null
  })
}

export async function saveMailDraft(d: Draft, draftId: number | null) {
  return run(async (s) => mail.saveDraft(s, outgoing(d), draftId ? id(draftId) : null))
}

/** Leaving the editor: put the draft in the Drafts folder now (and drop the copy it replaces, when editing one). */
export async function keepMailDraft(draftId: number, replacesMessageId: number | null) {
  return run(async (s) => {
    await mail.moveDraftToServer(s, id(draftId))
    if (replacesMessageId) await mail.deleteMessage(s, id(replacesMessageId)).catch(() => undefined)
    return null
  })
}

export async function discardMailDraft(draftId: number) {
  return run(async (s) => {
    await mail.deleteDraft(s, id(draftId)).catch(() => undefined)
    return null
  })
}
