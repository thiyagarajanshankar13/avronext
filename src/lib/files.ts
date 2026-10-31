import 'server-only'

const INLINE = /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)$/
/** Shown inline by the Files viewer (`?view`): PDFs and audio/video the browser plays itself. */
const VIEWABLE = /^(application\/pdf|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp4|ogg|wav|x-wav|webm|flac|aac))$/

/** Upload limit per file (MAX_UPLOAD_MB, default 100). Nextcloud's own limits still apply. */
export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB)
  return (Number.isFinite(mb) && mb > 0 ? mb : 100) * 1024 * 1024
}

/** A safe single file name: no path parts, no characters Nextcloud rejects. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f:*?"<>|]/g, '-')
    .trim()
    .replace(/^\.+$/, '')
    .slice(0, 200)
  return cleaned || 'file'
}

/**
 * Same-origin check for state-changing requests to route handlers. The session
 * cookie is SameSite=Lax already; this also rejects other sites' fetches.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * Streams a Nextcloud file to the browser. Only images are shown inline;
 * everything else downloads, and the sandbox CSP stops an uploaded SVG/HTML
 * file from running script on our origin.
 */
export function fileResponse(upstream: Response, name: string, opts: { download?: boolean; view?: boolean } = {}): Response {
  const type = (upstream.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim()
  const media = Boolean(opts.view) && VIEWABLE.test(type)
  const inline = !opts.download && (INLINE.test(type) || media)
  const headers: Record<string, string> = {
    'Content-Type': inline ? type : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'private, max-age=300',
    // The browser's PDF viewer doesn't run in a sandboxed document; a PDF can't script our origin anyway.
    'Content-Security-Policy': inline && type === 'application/pdf' ? "default-src 'none'; object-src 'self'" : "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'X-Content-Type-Options': 'nosniff',
  }
  for (const h of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = upstream.headers.get(h)
    if (v) headers[h] = v
  }
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers })
}

export const jsonError = (error: string, status: number) => Response.json({ error }, { status })
