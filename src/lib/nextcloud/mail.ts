import 'server-only'
import { mailServer } from '../env'
import type { Session } from '../session'
import { NextcloudAppMissingError, NextcloudError, ncRequest } from './http'

/**
 * Nextcloud Mail (the Mail app's REST API under /index.php/apps/mail/api, plus
 * its OCS send endpoint). Accounts, folders and messages live in Nextcloud
 * Mail; AvroNext only shows them. Accounts AvroNext creates use the server in
 * MAIL_IMAP_* / MAIL_SMTP_*; the password goes straight to Nextcloud, which
 * stores it (encrypted) like any account added in its Mail app.
 *
 * The Mail app's API is not a versioned public API: keep every call here.
 * Tested against Mail 5.5.
 */

const APP = 'Mail'
const BASE = '/index.php/apps/mail/api'

export type MailAccount = {
  id: number
  /** The account's display name (sent as From). */
  name: string
  emailAddress: string
  signature: string | null
  imapHost: string
  imapUser: string
  draftsMailboxId: number | null
  sentMailboxId: number | null
  trashMailboxId: number | null
  archiveMailboxId: number | null
  /** Nextcloud Mail marks accounts it created from the admin's provisioning settings. */
  provisioningId: number | null
}

export type Mailbox = {
  databaseId: number
  accountId: number
  name: string
  displayName: string
  specialRole: string | null
  unread: number
  delimiter: string | null
  attributes: string[]
}

export type MailAddress = { label: string; email: string }

export type MailFlags = { seen: boolean; flagged: boolean; answered: boolean; draft: boolean; forwarded: boolean; hasAttachments: boolean; important: boolean }

export type MailSummary = {
  databaseId: number
  uid: number
  mailboxId: number
  subject: string
  from: MailAddress[]
  to: MailAddress[]
  cc: MailAddress[]
  dateInt: number
  flags: MailFlags
  previewText: string | null
  messageId: string
  threadRootId: string | null
}

export type MailAttachment = { id: string; fileName: string; mime: string; size: number; cid: string | null; isImage: boolean }

export type MailMessage = MailSummary & {
  bcc: MailAddress[]
  replyTo: MailAddress[]
  hasHtmlBody: boolean
  /** Plain-text body (when there's no HTML part) or Nextcloud's sanitised HTML. */
  body: string
  attachments: MailAttachment[]
  accountId: number
}

type Envelope = { status?: string; data?: unknown; message?: string }

const FRIENDLY: Record<string, string> = {
  AUTHENTICATION: 'The mail server didn’t accept that username and password.',
  CONNECTION_ERROR: 'Couldn’t reach the mail server. Check with your administrator.',
  HOST_UNREACHABLE: 'Couldn’t reach the mail server. Check with your administrator.',
  CERTIFICATE_ERROR: 'The mail server’s security certificate isn’t valid.',
  TOO_MANY_REQUESTS: 'Too many attempts. Wait a minute and try again.',
}

async function call<T>(s: Session, path: string, opts: { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<T> {
  const res = await ncRequest(s, BASE + path, { method: opts.method, body: opts.body, raw: opts.raw, headers: { Accept: 'application/json', ...opts.headers }, app: APP, signal: opts.signal })
  const type = res.headers.get('content-type') ?? ''
  if (res.status === 404 && !type.includes('json')) throw new NextcloudAppMissingError(APP, path)
  const data = type.includes('json') ? ((await res.json().catch(() => null)) as Envelope | T | null) : null
  const env = (data && typeof data === 'object' && 'status' in (data as object) ? (data as Envelope) : null) as Envelope | null
  if (!res.ok || env?.status === 'fail' || env?.status === 'error') {
    const d = (env?.data ?? {}) as { error?: string; message?: string; type?: string; service?: string }
    const code = d.error ?? ''
    let msg = FRIENDLY[code] ?? d.message ?? env?.message ?? `Nextcloud Mail returned ${res.status}`
    if (code === 'CONNECTION_ERROR' && d.service) msg = `Couldn’t reach the ${d.service === 'SMTP' ? 'outgoing (SMTP)' : 'incoming (IMAP)'} mail server.`
    if (res.status === 429) msg = FRIENDLY.TOO_MANY_REQUESTS
    const err = new NextcloudError(msg, res.status === 200 ? 400 : res.status, path)
    ;(err as NextcloudError & { code?: string }).code = d.type?.includes('MailboxNotCached') ? 'NOT_CACHED' : code
    throw err
  }
  return (env && 'data' in env ? env.data : data) as T
}

// ---- Accounts ----

export const listAccounts = (s: Session) => call<MailAccount[]>(s, '/accounts')

const fill = (template: string, s: Session, email: string) => template.replace(/%EMAIL%/g, email).replace(/%USERID%/g, s.userId)

/** The username to suggest for a person (MAIL_USERNAME template, default their email). */
export function suggestedUsername(s: Session, email: string) {
  const server = mailServer()
  return server ? fill(server.username, s, email) : email
}

function serverSettings() {
  const server = mailServer()
  if (!server) throw new NextcloudError('Mail isn’t set up on this server.', 400, '/accounts')
  return server
}

export async function createAccount(s: Session, input: { name: string; email: string; username: string; password: string }): Promise<MailAccount> {
  const server = serverSettings()
  const account = await call<MailAccount>(s, '/accounts', {
    method: 'POST',
    body: {
      accountName: input.name,
      emailAddress: input.email,
      imapHost: server.imap.host,
      imapPort: server.imap.port,
      imapSslMode: server.imap.security,
      imapUser: input.username,
      imapPassword: input.password,
      smtpHost: server.smtp.host,
      smtpPort: server.smtp.port,
      smtpSslMode: server.smtp.security,
      smtpUser: input.username,
      smtpPassword: input.password,
      authMethod: 'password',
    },
  })
  return account
}

/** New password (and username) for an account on our server. */
export async function reconnectAccount(s: Session, account: MailAccount, input: { username: string; password: string }) {
  const server = serverSettings()
  return call<MailAccount>(s, `/accounts/${account.id}`, {
    method: 'PUT',
    body: {
      accountName: account.name,
      emailAddress: account.emailAddress,
      imapHost: server.imap.host,
      imapPort: server.imap.port,
      imapSslMode: server.imap.security,
      imapUser: input.username,
      imapPassword: input.password,
      smtpHost: server.smtp.host,
      smtpPort: server.smtp.port,
      smtpSslMode: server.smtp.security,
      smtpUser: input.username,
      smtpPassword: input.password,
      authMethod: 'password',
    },
  })
}

export const deleteAccount = (s: Session, id: number) => call<unknown>(s, `/accounts/${id}`, { method: 'DELETE' })

export const setSignature = (s: Session, id: number, signature: string | null) =>
  call<unknown>(s, `/accounts/${id}/signature`, { method: 'PUT', body: { signature } })

export const patchAccount = (s: Session, id: number, patch: Partial<Record<'sentMailboxId' | 'draftsMailboxId' | 'trashMailboxId' | 'archiveMailboxId', number>>) =>
  call<MailAccount>(s, `/accounts/${id}`, { method: 'PATCH', body: patch })

// ---- Folders ----

export async function listMailboxes(s: Session, accountId: number): Promise<Mailbox[]> {
  const r = await call<{ mailboxes: Mailbox[] }>(s, `/mailboxes?accountId=${accountId}`)
  return r.mailboxes ?? []
}

export const createMailbox = (s: Session, accountId: number, name: string) => call<Mailbox>(s, '/mailboxes', { method: 'POST', body: { accountId, name } })

export type SyncResult = { newMessages: MailSummary[]; changedMessages: MailSummary[]; vanishedMessages: number[] }

/**
 * Fetches what changed on the mail server into Nextcloud Mail's cache. While a folder's first download is
 * still running in Nextcloud (minutes for a big mailbox), other syncs of it hang, so callers bound the wait
 * (`waitMs`) and carry on with the cached copy; Nextcloud finishes the work by itself.
 */
export async function syncMailbox(s: Session, mailboxId: number, opts: { ids?: number[]; init?: boolean; lastMessageTimestamp?: number | null; query?: string | null; waitMs?: number } = {}) {
  return call<SyncResult>(s, `/mailboxes/${mailboxId}/sync`, {
    method: 'POST',
    signal: opts.waitMs ? AbortSignal.timeout(opts.waitMs) : undefined,
    body: { ids: opts.ids ?? [], init: opts.init ?? false, lastMessageTimestamp: opts.lastMessageTimestamp ?? null, query: opts.query ?? null },
  })
}

export const markAllRead = (s: Session, mailboxId: number) => call<unknown>(s, `/mailboxes/${mailboxId}/read`, { method: 'POST' })

// ---- Messages ----

/** A bounded wait (`waitMs`) ran out. */
export const isTimeout = (err: unknown) => ['TimeoutError', 'AbortError'].includes((err as { name?: string })?.name ?? '')

/** Nextcloud Mail hasn't downloaded this folder yet (see primeMailbox). */
export const isNotCached = (err: unknown) => (err as { code?: string })?.code === 'NOT_CACHED' || (err as { status?: number })?.status === 428

/**
 * First download of a folder into Nextcloud Mail's cache. On a big mailbox this one request runs for
 * minutes (headers in parts of 5000, then threading), so we wait at most `waitMs` and leave Nextcloud
 * to finish on its own (PHP keeps going when we stop waiting). `done`: cached; `more`: a part is in, call again; `running`: still going
 * (this call or an earlier one), poll listMessages until it stops saying "not cached".
 */
export async function primeMailbox(s: Session, mailboxId: number, waitMs = 10_000): Promise<'done' | 'more' | 'running'> {
  try {
    await syncMailbox(s, mailboxId, { init: true, waitMs })
    return 'done'
  } catch (err) {
    const e = err as { status?: number }
    if (isTimeout(err)) return 'running'
    if (e.status === 202) return 'more' // IncompleteSyncException
    if (e.status === 409) return 'running' // already being synced
    throw err
  }
}

/** A page of messages (newest first, one per conversation). `cursor` = dateInt of the last one shown. Throws (isNotCached) for a folder that isn't downloaded yet. */
export async function listMessages(s: Session, mailboxId: number, opts: { cursor?: number | null; filter?: string | null; limit?: number } = {}): Promise<MailSummary[]> {
  const q = new URLSearchParams({ mailboxId: String(mailboxId), limit: String(opts.limit ?? 30) })
  if (opts.cursor) q.set('cursor', String(opts.cursor))
  if (opts.filter) q.set('filter', opts.filter)
  return call<MailSummary[]>(s, `/messages?${q}`)
}

export const getMessage = (s: Session, id: number) => call<MailMessage>(s, `/messages/${id}/body`)
export const getThread = (s: Session, id: number) => call<MailSummary[]>(s, `/messages/${id}/thread`)

export const setFlags = (s: Session, id: number, flags: Partial<Record<'seen' | 'flagged' | 'answered' | 'forwarded', boolean>>) =>
  call<unknown>(s, `/messages/${id}/flags`, { method: 'PUT', body: { flags } })

export const moveMessage = (s: Session, id: number, destFolderId: number) =>
  call<unknown>(s, `/messages/${id}/move`, { method: 'POST', body: { destFolderId } })

/** Moves to Trash, or deletes for good when it's already in Trash (Nextcloud Mail's rule). */
export const deleteMessage = (s: Session, id: number) => call<unknown>(s, `/messages/${id}`, { method: 'DELETE' })

/** Nextcloud's sanitised HTML document for a message (scripts removed, remote images blocked). */
export async function messageHtml(s: Session, id: number): Promise<string> {
  const res = await ncRequest(s, `${BASE}/messages/${id}/html`, { headers: { Accept: 'text/html' }, app: APP })
  if (!res.ok) throw new NextcloudError(`Could not load the message (${res.status})`, res.status, 'html')
  return res.text()
}

export const attachmentResponse = (s: Session, id: number, attachmentId: string) =>
  ncRequest(s, `${BASE}/messages/${id}/attachment/${encodeURIComponent(attachmentId)}`, { headers: { Accept: '*/*' }, app: APP })

/** Copies an attachment into the person's Nextcloud files (folder path, e.g. "/Documents"). */
export const saveAttachment = (s: Session, id: number, attachmentId: string, folder: string) =>
  call<unknown>(s, `/messages/${id}/attachment/${encodeURIComponent(attachmentId)}`, { method: 'POST', body: { targetPath: folder } })

// ---- Writing ----

export type LocalAttachment = { id: number; fileName: string; mimeType: string; size?: number }

/** Uploads a file for a message being written (Nextcloud Mail keeps it until sent). */
export async function uploadAttachment(s: Session, file: File): Promise<LocalAttachment> {
  const form = new FormData()
  form.set('attachment', file, file.name)
  return call<LocalAttachment>(s, '/attachments', { method: 'POST', raw: form })
}

export type OutgoingAttachment =
  | { type: 'local'; id: number }
  | { type: 'cloud'; fileName: string }
  | { type: 'message-attachment'; mailboxId: number; uid: number; id: string; fileName: string }

export type Outgoing = {
  accountId: number
  subject: string
  bodyHtml: string
  bodyPlain: string
  to: MailAddress[]
  cc: MailAddress[]
  bcc: MailAddress[]
  attachments: OutgoingAttachment[]
  inReplyToMessageId?: string | null
}

const outgoingBody = (m: Outgoing) => ({
  accountId: m.accountId,
  subject: m.subject,
  bodyPlain: m.bodyPlain,
  bodyHtml: m.bodyHtml,
  editorBody: m.bodyHtml,
  isHtml: true,
  smimeSign: false,
  smimeEncrypt: false,
  to: m.to,
  cc: m.cc,
  bcc: m.bcc,
  attachments: m.attachments,
  inReplyToMessageId: m.inReplyToMessageId ?? null,
})

/** Sends now: queues the message in Nextcloud Mail's outbox, then sends it. */
export async function sendMessage(s: Session, m: Outgoing & { draftId?: number | null }) {
  const queued = await call<{ id: number }>(s, '/outbox', { method: 'POST', body: { ...outgoingBody(m), draftId: m.draftId ?? null } })
  try {
    await call<unknown>(s, `/outbox/${queued.id}`, { method: 'POST' })
  } catch (err) {
    // Don't leave a failed copy waiting in the outbox (Nextcloud would retry it later).
    await call<unknown>(s, `/outbox/${queued.id}`, { method: 'DELETE' }).catch(() => undefined)
    throw err
  }
}

/** Saves a draft (Nextcloud Mail stores it and puts it in the Drafts folder). Returns its id. */
export async function saveDraft(s: Session, m: Outgoing, draftId: number | null): Promise<number> {
  if (draftId) {
    await call<unknown>(s, `/drafts/${draftId}`, { method: 'PUT', body: outgoingBody(m) })
    return draftId
  }
  const d = await call<{ id: number }>(s, '/drafts', { method: 'POST', body: outgoingBody(m) })
  return d.id
}

export const deleteDraft = (s: Session, draftId: number) => call<unknown>(s, `/drafts/${draftId}`, { method: 'DELETE' })

/** Uploads a saved draft to the Drafts folder on the mail server now. */
export const moveDraftToServer = (s: Session, draftId: number) => call<unknown>(s, `/drafts/move/${draftId}`, { method: 'POST' })

export type Recipient = { id: string; label: string; email: string }

/** Address suggestions (contacts and people mailed before). */
export async function autocomplete(s: Session, term: string): Promise<Recipient[]> {
  const r = await call<Recipient[]>(s, `/autoComplete?term=${encodeURIComponent(term)}`)
  return (r ?? []).filter((x) => x.email)
}
