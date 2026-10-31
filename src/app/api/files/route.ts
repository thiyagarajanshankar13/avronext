import { type NextRequest } from 'next/server'
import { fileResponse } from '@/lib/files'
import { davPath, ncRequest } from '@/lib/nextcloud/http'
import { getSession } from '@/lib/session'

/**
 * Streams one of the signed-in user's files. `?download` forces a download;
 * `?view` (the Files viewer) also shows PDFs and audio/video inline, with
 * Range requests passed through so media can seek.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const path = req.nextUrl.searchParams.get('path') ?? ''
  const segments = path.split('/').filter(Boolean)
  if (!segments.length || segments.some((s) => s === '..' || s === '.')) return new Response('Bad path', { status: 400 })
  const range = req.headers.get('range')
  try {
    const res = await ncRequest(session, davPath(session.userId, ...segments), { headers: { Accept: '*/*', ...(range ? { Range: range } : {}) } })
    if (!res.ok) return new Response('Not found', { status: res.status === 404 ? 404 : 502 })
    const q = req.nextUrl.searchParams
    return fileResponse(res, segments[segments.length - 1], { download: q.has('download'), view: q.has('view') })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
