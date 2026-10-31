import { type NextRequest } from 'next/server'
import { ncRequest } from '@/lib/nextcloud/http'
import { getSession } from '@/lib/session'

/** Thumbnail of a file the user can access (Nextcloud's preview service): `?size=64…1600`. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const fileId = Number((await params).fileId)
  if (!Number.isInteger(fileId) || fileId <= 0) return new Response('Bad request', { status: 400 })
  const size = Math.min(1600, Math.max(64, Number(req.nextUrl.searchParams.get('size')) || 256))
  try {
    const res = await ncRequest(session, `/index.php/core/preview?fileId=${fileId}&x=${size}&y=${size}&a=1`, { headers: { Accept: 'image/*' } })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/')) return new Response('No preview', { status: 404 })
    return new Response(res.body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, max-age=3600',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response('No preview', { status: 404 })
  }
}
