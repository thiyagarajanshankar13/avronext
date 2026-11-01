/**
 * A redirect with a relative Location. Behind a proxy (Docker, Railway…) the
 * server only knows its bind address, so `new URL(path, req.url)` would send
 * the browser to e.g. http://0.0.0.0:8080/login; browsers resolve a relative
 * Location against the address they actually used.
 */
export function redirectTo(path: string, status: 302 | 303 | 307 = 307): Response {
  return new Response(null, { status, headers: { Location: path } })
}

/**
 * Absolute URL for `path` as the browser addressed us (middleware redirects
 * must be absolute): the Host / X-Forwarded-* headers, not the bind address.
 */
export function publicUrl(req: Request, path: string): URL {
  const own = new URL(req.url)
  const host = req.headers.get('x-forwarded-host')?.split(',')[0].trim() || req.headers.get('host') || own.host
  const fwd = req.headers.get('x-forwarded-proto')?.split(',')[0].trim()
  const proto = fwd === 'http' || fwd === 'https' ? fwd + ':' : own.protocol
  try {
    return new URL(path, `${proto}//${host}`)
  } catch {
    return new URL(path, own)
  }
}
