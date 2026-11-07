import 'server-only'
import { redirect } from 'next/navigation'
import { nextcloudUrl } from '../env'
import type { Session } from '../session'

export const USER_AGENT = 'AvroNext'

export class NextcloudError extends Error {
  constructor(
    message: string,
    public status: number,
    public path: string,
  ) {
    super(message)
    this.name = 'NextcloudError'
  }
}

/** The app password was revoked or the user removed: send them back to sign in. */
export class NextcloudAuthError extends NextcloudError {}

/** The Nextcloud app behind an endpoint (Deck, Collectives) isn't installed/enabled. */
export class NextcloudAppMissingError extends NextcloudError {
  constructor(
    public app: string,
    path: string,
  ) {
    super(`The Nextcloud “${app}” app is not installed or not enabled for your account.`, 404, path)
  }
}

export function basicAuth(loginName: string, password: string): string {
  return 'Basic ' + Buffer.from(`${loginName}:${password}`).toString('base64')
}

type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  /** Raw body (WebDAV PUT); skips JSON encoding. */
  raw?: BodyInit
  /** Name of the Nextcloud app this endpoint belongs to, for a friendly 404. */
  app?: string
  /** Gives up waiting (Nextcloud may carry on with the work). */
  signal?: AbortSignal
}

/** Low-level authenticated request against Nextcloud. Returns the Response. */
export async function ncRequest(session: Session, path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: basicAuth(session.loginName, session.appPassword),
    'OCS-APIRequest': 'true',
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
    ...opts.headers,
  }
  let body: BodyInit | undefined = opts.raw
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  const init: RequestInit & { duplex?: 'half' } = { method: opts.method ?? 'GET', headers, body, cache: 'no-store', signal: opts.signal }
  // Streamed request bodies (uploads passed straight through) need half-duplex.
  if (body instanceof ReadableStream) init.duplex = 'half'
  const res = await fetch(nextcloudUrl() + path, init)
  if (res.status === 401) throw new NextcloudAuthError('Your Nextcloud session has expired.', 401, path)
  return res
}

async function errorFor(res: Response, path: string, app?: string): Promise<NextcloudError> {
  // A disabled app's routes don't exist, so Nextcloud answers with its HTML 404 page.
  if (app && res.status === 404 && !(res.headers.get('content-type') ?? '').includes('json')) {
    return new NextcloudAppMissingError(app, path)
  }
  let message = `Nextcloud returned ${res.status}`
  try {
    const data = (await res.json()) as { message?: string; ocs?: { meta?: { message?: string }; data?: { message?: string } } }
    message = data.message || data.ocs?.data?.message || data.ocs?.meta?.message || message
  } catch {
    /* not JSON */
  }
  return new NextcloudError(message, res.status, path)
}

/** JSON request (Deck REST API style). */
export async function ncJson<T>(session: Session, path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await ncRequest(session, path, opts)
  if (!res.ok) throw await errorFor(res, path, opts.app)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** OCS request: unwraps `ocs.data`. */
export async function ocs<T>(session: Session, path: string, opts: RequestOptions = {}): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  const data = await ncJson<{ ocs: { data: T } }>(session, `/ocs/v2.php${path}${sep}format=json`, opts)
  return data.ocs.data
}

/**
 * Wraps a server-component data load: an expired app password sends the user
 * through /logout (which clears the cookie — not allowed while rendering).
 */
export async function loadOrSignOut<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (err) {
    if (err instanceof NextcloudAuthError) redirect('/logout?expired=1')
    throw err
  }
}

export function davPath(userId: string, ...segments: string[]): string {
  const parts = segments
    .flatMap((s) => s.split('/'))
    .filter(Boolean)
    .map(encodeURIComponent)
  return `/remote.php/dav/files/${encodeURIComponent(userId)}/${parts.join('/')}`
}
