import 'server-only'

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** Nextcloud base URL used by the server. Read lazily so `next build` works without it. */
export function nextcloudUrl(): string {
  const url = process.env.NEXTCLOUD_URL
  if (!url) throw new Error('NEXTCLOUD_URL is not set. Copy .env.example to .env and point it at your Nextcloud.')
  return trimSlash(url)
}

/** Nextcloud base URL as seen from the browser ("Open in Nextcloud" links). */
export function nextcloudPublicUrl(): string {
  return trimSlash(process.env.NEXTCLOUD_PUBLIC_URL || nextcloudUrl())
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters (openssl rand -base64 48).')
  }
  return secret
}

export function cookieSecure(): boolean {
  const v = process.env.COOKIE_SECURE
  if (v === 'false' || v === '0') return false
  if (v === 'true' || v === '1') return true
  return process.env.NODE_ENV === 'production'
}

export type MailSecurity = 'ssl' | 'tls' | 'none'
export type MailServer = {
  imap: { host: string; port: number; security: MailSecurity }
  smtp: { host: string; port: number; security: MailSecurity }
  /** Username template: %EMAIL% (default), %USERID%, or e.g. "%USERID%@example.com". */
  username: string
}

/** ssl = implicit TLS (993/465), tls = STARTTLS (143/587), none = plain (Nextcloud Mail's names). */
function security(v: string | undefined, port: number, implicit: number): MailSecurity {
  const s = (v ?? '').trim().toLowerCase()
  if (s === 'ssl' || s === 'tls' || s === 'none') return s
  if (s === 'starttls') return 'tls'
  return port === implicit ? 'ssl' : 'tls'
}

/**
 * The mail server AvroNext's Mail connects people to (through Nextcloud Mail),
 * from MAIL_IMAP_* / MAIL_SMTP_*. null = Mail is off.
 */
export function mailServer(): MailServer | null {
  const imapHost = process.env.MAIL_IMAP_HOST?.trim()
  const smtpHost = process.env.MAIL_SMTP_HOST?.trim()
  if (!imapHost || !smtpHost) return null
  const imapPort = Number(process.env.MAIL_IMAP_PORT) || 993
  const smtpPort = Number(process.env.MAIL_SMTP_PORT) || 465
  return {
    imap: { host: imapHost, port: imapPort, security: security(process.env.MAIL_IMAP_SECURITY, imapPort, 993) },
    smtp: { host: smtpHost, port: smtpPort, security: security(process.env.MAIL_SMTP_SECURITY, smtpPort, 465) },
    username: process.env.MAIL_USERNAME?.trim() || '%EMAIL%',
  }
}
