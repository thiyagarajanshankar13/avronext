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
