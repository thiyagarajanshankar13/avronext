import { type NextRequest } from 'next/server'
import { cleanFileName, jsonError, maxUploadBytes, sameOrigin } from '@/lib/files'
import { NextcloudAuthError, NextcloudError } from '@/lib/nextcloud/http'
import { uploadAttachment } from '@/lib/nextcloud/mail'
import { getSession } from '@/lib/session'

/** A file for a message being written (multipart `file`). Skips the middleware like other uploads, so checks the session itself. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return jsonError('Your session has expired.', 401)
  if (!sameOrigin(req)) return jsonError('Forbidden', 403)
  const limit = maxUploadBytes()
  if (Number(req.headers.get('content-length')) > limit + 64 * 1024) return jsonError(`Attachments can be at most ${Math.round(limit / 1048576)} MB.`, 413)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return jsonError('No file was sent.', 400)
  if (file.size > limit) return jsonError(`Attachments can be at most ${Math.round(limit / 1048576)} MB.`, 413)
  try {
    const named = new File([file], cleanFileName(file.name), { type: file.type || 'application/octet-stream' })
    return Response.json(await uploadAttachment(session, named))
  } catch (err) {
    if (err instanceof NextcloudAuthError) return jsonError('Your session has expired.', 401)
    return jsonError(err instanceof NextcloudError ? err.message : 'Upload failed.', 502)
  }
}
