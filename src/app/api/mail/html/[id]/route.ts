import { type NextRequest } from 'next/server'
import { getMessage, messageHtml } from '@/lib/nextcloud/mail'
import { getSession } from '@/lib/session'

/**
 * A message's HTML for the reading pane's iframe. Nextcloud Mail has already
 * sanitised it (no scripts, remote images blocked); on top of that we:
 * - drop Nextcloud's own script tag and point inline (cid:) images at our attachment route;
 * - keep remote images hidden unless `?images=1` (then load them from their address);
 * - open links in a new tab, and serve it with a script-free sandbox CSP.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return new Response('Bad request', { status: 400 })
  const showImages = req.nextUrl.searchParams.get('images') === '1'
  try {
    const [raw, message] = await Promise.all([messageHtml(session, id), getMessage(session, id)])
    const cids = new Map(message.attachments.filter((a) => a.cid).map((a) => [a.cid!, a]))
    let blocked = 0
    let html = raw
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<script\b[^>]*\/>/gi, '')
      .replace(/<div data-iframe-size>\s*<\/div>/gi, '')
      // Inline images sent with the message.
      .replace(/(<img\b[^>]*?\bsrc=")cid:([^"]+)(")/gi, (m, a, cid, b) => {
        const att = cids.get(cid.replace(/^<|>$/g, ''))
        return att ? `${a}/api/mail/attachment/${id}/${encodeURIComponent(att.id)}?inline&amp;name=${encodeURIComponent(att.fileName)}${b}` : m
      })
      // Remote images: Nextcloud swapped them for a placeholder and kept the address in data-original-src.
      .replace(/<img\b([^>]*?)\bsrc="[^"]*blocked-image[^"]*"([^>]*?)data-original-src="([^"]*)"([^>]*)>/gi, (_m, a, b, orig, c) => {
        blocked++
        let url = orig.replace(/&amp;/g, '&')
        try {
          const u = new URL(url, 'http://x')
          url = u.searchParams.get('src') ?? url
        } catch {
          /* keep as is */
        }
        const attrs = `${a}${b}${c}`.replace(/\bstyle="display:\s*none;?"/i, '')
        return showImages && /^https?:\/\//i.test(url) ? `<img src="${esc(url)}"${attrs} referrerpolicy="no-referrer">` : `<img data-avn-blocked="1"${attrs} style="display:none">`
      })
    const head = `<base target="_blank"><meta name="referrer" content="no-referrer"><style>
html{background:#fff}body{margin:0;padding:4px 2px;color:#172b4d;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;overflow-wrap:anywhere}
img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}blockquote{margin:0 0 0 .5em;padding-left:.8em;border-left:3px solid #dfe1e6;color:#44546f}a{color:#0c66e4}
</style>`
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${head}`) : `<!doctype html><html><head>${head}</head><body>${html}</body></html>`
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Blocked-Images': String(blocked),
        'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src 'self' data:${showImages ? ' https: http:' : ''}; sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox`,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
