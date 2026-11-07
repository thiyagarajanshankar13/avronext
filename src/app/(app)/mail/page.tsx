import { notFound } from 'next/navigation'
import { AppMissing } from '@/components/AppMissing'
import { ConnectMailbox } from '@/components/mail/ConnectMailbox'
import { MailApp } from '@/components/mail/MailApp'
import { mailServer } from '@/lib/env'
import { loadOrSignOut, NextcloudAppMissingError } from '@/lib/nextcloud/http'
import { listAccounts, listMailboxes, type MailAccount } from '@/lib/nextcloud/mail'
import { fetchCurrentUser } from '@/lib/nextcloud/user'
import { requireSession } from '@/lib/session'

export const metadata = { title: 'Mail' }

/** Signatures written in Nextcloud Mail are HTML; AvroNext edits them as plain text. */
const signatureText = (sig: string | null) =>
  sig
    ? sig
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : null

/**
 * Mail, through Nextcloud Mail. Off unless MAIL_IMAP_HOST / MAIL_SMTP_HOST are
 * set. People without a mailbox in Nextcloud Mail get "Connect your mailbox"
 * (our server, their password); everyone else sees their mail.
 */
export default async function MailPage() {
  const server = mailServer()
  if (!server) notFound()
  const session = await requireSession()
  let accounts: MailAccount[]
  try {
    accounts = await loadOrSignOut(() => listAccounts(session))
  } catch (err) {
    if (err instanceof NextcloudAppMissingError) return <main className="main"><AppMissing app="Mail" detail={err.message} /></main>
    throw err
  }
  const me = await fetchCurrentUser(session.loginName, session.appPassword).catch(() => null)
  const profile = { name: me?.displayName ?? session.displayName, email: me?.email ?? '', userId: session.userId }

  if (!accounts.length) {
    return (
      <main className="main mail-connect-page">
        <ConnectMailbox name={profile.name} email={profile.email} usernameTemplate={server.username} userId={session.userId} server={server.imap.host} />
      </main>
    )
  }
  const first = accounts[0]
  const mailboxes = await loadOrSignOut(() => listMailboxes(session, first.id))
  return (
    <MailApp
      accounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.emailAddress,
        signature: signatureText(a.signature),
        username: a.imapUser,
        ours: a.imapHost === server.imap.host,
      }))}
      initialAccountId={first.id}
      initialMailboxes={mailboxes}
      me={profile}
      server={server.imap.host}
      usernameTemplate={server.username}
    />
  )
}
