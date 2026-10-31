import { type NextRequest } from 'next/server'
import { jsonError, sameOrigin } from '@/lib/files'
import { abortChunked, finishChunked, putChunk, putFile, startChunked } from '@/lib/nextcloud/files'
import { NextcloudAuthError, NextcloudError } from '@/lib/nextcloud/http'
import { getSession } from '@/lib/session'

/**
 * Files uploads, streamed straight through to Nextcloud (this path skips the
 * middleware, which would buffer bodies). The browser sends files of up to one
 * chunk with `op=put`, bigger ones as Nextcloud chunked uploads:
 * `op=start` → `op=chunk&n=1…` → `op=finish&size=` (or `op=abort`).
 */
const MAX_BODY = 16 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return jsonError('Your session has expired.', 401)
  if (!sameOrigin(req)) return jsonError('Forbidden', 403)
  const q = req.nextUrl.searchParams
  const op = q.get('op')
  const path = q.get('path') ?? ''
  const id = q.get('id') ?? ''
  const overwrite = q.get('overwrite') === '1'
  if (op !== 'start' && op !== 'put' && !/^avronext-[a-z0-9-]{8,64}$/.test(id)) return jsonError('Bad request', 400)
  try {
    if (op === 'put' || op === 'chunk') {
      const length = req.headers.get('content-length')
      if (!length || !/^\d+$/.test(length)) return jsonError('Missing length.', 411)
      if (Number(length) > MAX_BODY) return jsonError('Chunk too large.', 413)
      const body = req.body ?? new Uint8Array()
      if (op === 'put') return Response.json(await putFile(session, path, body, length, overwrite))
      const n = Number(q.get('n'))
      if (!Number.isInteger(n) || n < 1 || n > 10000) return jsonError('Bad request', 400)
      await putChunk(session, id, n, path, body, length)
      return Response.json({ ok: true })
    }
    if (op === 'start') {
      const newId = `avronext-${crypto.randomUUID()}`
      await startChunked(session, newId, path)
      return Response.json({ id: newId })
    }
    if (op === 'finish') {
      const size = Number(q.get('size'))
      if (!Number.isFinite(size) || size < 0) return jsonError('Bad request', 400)
      return Response.json(await finishChunked(session, id, path, size, overwrite))
    }
    if (op === 'abort') {
      await abortChunked(session, id)
      return Response.json({ ok: true })
    }
    return jsonError('Bad request', 400)
  } catch (err) {
    if (err instanceof NextcloudAuthError) return jsonError('Your session has expired.', 401)
    const status = err instanceof NextcloudError && [400, 403, 404, 405, 412, 423, 507].includes(err.status) ? err.status : 502
    return jsonError(err instanceof Error ? err.message : 'Upload failed.', status === 405 ? 412 : status)
  }
}
