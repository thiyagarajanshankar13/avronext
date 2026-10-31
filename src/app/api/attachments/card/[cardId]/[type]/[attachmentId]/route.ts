import { type NextRequest } from 'next/server'
import { fileResponse, jsonError, sameOrigin } from '@/lib/files'
import { deleteAttachment, fetchAttachment } from '@/lib/nextcloud/deck'
import { NextcloudAuthError, NextcloudError } from '@/lib/nextcloud/http'
import { getSession } from '@/lib/session'

type Params = { params: Promise<{ cardId: string; type: string; attachmentId: string }> }

async function parse(req: NextRequest, params: Params['params']) {
  const p = await params
  const ids = {
    cardId: Number(p.cardId),
    attachmentId: Number(p.attachmentId),
    boardId: Number(req.nextUrl.searchParams.get('board')),
    stackId: Number(req.nextUrl.searchParams.get('stack')),
  }
  const ok = Object.values(ids).every((n) => Number.isInteger(n) && n > 0) && /^[a-z_]+$/.test(p.type)
  return ok ? { ...ids, type: p.type } : null
}

/** Streams a card attachment: images inline, anything else (or `?download`) as a download. */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const a = await parse(req, params)
  if (!a) return new Response('Bad request', { status: 400 })
  try {
    const res = await fetchAttachment(session, a.boardId, a.stackId, a.cardId, a.type, a.attachmentId)
    if (!res.ok) return new Response('Not found', { status: res.status === 404 ? 404 : 502 })
    const name = req.nextUrl.searchParams.get('name') || 'attachment'
    return fileResponse(res, name, { download: req.nextUrl.searchParams.has('download') })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return jsonError('Your session has expired.', 401)
  if (!sameOrigin(req)) return jsonError('Forbidden', 403)
  const a = await parse(req, params)
  if (!a) return jsonError('Bad request', 400)
  try {
    await deleteAttachment(session, a.boardId, a.stackId, a.cardId, a.type, a.attachmentId)
    return Response.json({ ok: true })
  } catch (err) {
    if (err instanceof NextcloudAuthError) return jsonError('Your session has expired.', 401)
    return jsonError(err instanceof NextcloudError ? err.message : 'Delete failed.', 502)
  }
}
