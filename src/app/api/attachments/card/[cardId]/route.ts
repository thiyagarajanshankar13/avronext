import { type NextRequest } from 'next/server'
import { jsonError, maxUploadBytes, sameOrigin } from '@/lib/files'
import { uploadAttachment } from '@/lib/nextcloud/deck'
import { NextcloudAuthError, NextcloudError } from '@/lib/nextcloud/http'
import { getSession } from '@/lib/session'

/** Attach one file to a card: multipart `file`, query `board` + `stack`. A route (not an action) so big files stream. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const session = await getSession()
  if (!session) return jsonError('Your session has expired.', 401)
  if (!sameOrigin(req)) return jsonError('Forbidden', 403)
  const cardId = Number((await params).cardId)
  const boardId = Number(req.nextUrl.searchParams.get('board'))
  const stackId = Number(req.nextUrl.searchParams.get('stack'))
  if (![cardId, boardId, stackId].every((n) => Number.isInteger(n) && n > 0)) return jsonError('Bad request', 400)
  const limit = maxUploadBytes()
  if (Number(req.headers.get('content-length')) > limit + 64 * 1024) return jsonError(`Files can be at most ${Math.round(limit / 1048576)} MB.`, 413)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return jsonError('No file was sent.', 400)
  if (file.size > limit) return jsonError(`Files can be at most ${Math.round(limit / 1048576)} MB.`, 413)
  try {
    return Response.json(await uploadAttachment(session, boardId, stackId, cardId, file))
  } catch (err) {
    if (err instanceof NextcloudAuthError) return jsonError('Your session has expired.', 401)
    return jsonError(err instanceof NextcloudError ? err.message : 'Upload failed.', 502)
  }
}
