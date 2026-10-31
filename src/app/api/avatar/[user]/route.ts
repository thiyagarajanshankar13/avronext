import { type NextRequest } from 'next/server'
import { ncRequest } from '@/lib/nextcloud/http'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest, { params }: { params: Promise<{ user: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const { user } = await params
  const size = req.nextUrl.searchParams.get('size') === '128' ? 128 : 64
  try {
    const res = await ncRequest(session, `/index.php/avatar/${encodeURIComponent(user)}/${size}`, { headers: { Accept: 'image/*' } })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/')) return new Response('Not found', { status: 404 })
    return new Response(res.body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, max-age=3600',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
