import { type NextRequest } from 'next/server'
import { fileResponse } from '@/lib/files'
import { attachmentResponse } from '@/lib/nextcloud/mail'
import { getSession } from '@/lib/session'

/** Nextcloud Mail sends attachments as application/octet-stream; tell the browser what they are so images and PDFs can show. */
const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
}

/** A message attachment: `?name=` for the file name, `?inline` / `?view` to show images (PDFs, media) in the browser. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const { id, attachmentId } = await params
  if (!/^\d+$/.test(id) || !/^[\w.-]{1,64}$/.test(attachmentId)) return new Response('Bad request', { status: 400 })
  try {
    const res = await attachmentResponse(session, Number(id), attachmentId)
    if (!res.ok) return new Response('Not found', { status: 404 })
    const q = req.nextUrl.searchParams
    const name = (q.get('name') || 'attachment').replace(/[\\/]/g, '_')
    const upstream = res.headers.get('content-type') ?? ''
    const guessed = TYPES[name.slice(name.lastIndexOf('.') + 1).toLowerCase()]
    const typed =
      guessed && (!upstream || upstream.startsWith('application/octet-stream'))
        ? new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), 'content-type': guessed } })
        : res
    return fileResponse(typed, name, { download: !q.has('inline') && !q.has('view'), view: q.has('view') })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
