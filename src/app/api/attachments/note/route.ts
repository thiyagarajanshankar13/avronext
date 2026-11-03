import { type NextRequest } from 'next/server'
import { cleanFileName, jsonError, sameOrigin } from '@/lib/files'
import { NextcloudAuthError, NextcloudError } from '@/lib/nextcloud/http'
import { uploadNoteImage } from '@/lib/nextcloud/notes'
import { getSession } from '@/lib/session'

const MAX = 25 * 1024 * 1024

/** Adds an image to a note: raw body, `?path=<note path>&name=<file name>`. Returns the Markdown href. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return jsonError('Your session has expired.', 401)
  if (!sameOrigin(req)) return jsonError('Forbidden', 403)
  const path = req.nextUrl.searchParams.get('path') ?? ''
  const name = cleanFileName(req.nextUrl.searchParams.get('name') ?? 'image.png')
  const length = req.headers.get('content-length')
  if (!path || !length || !/^\d+$/.test(length)) return jsonError('Bad request', 400)
  if (Number(length) > MAX) return jsonError('Images can be at most 25 MB.', 413)
  if (!/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name)) return jsonError('Only images can be added to notes.', 415)
  try {
    return Response.json({ href: await uploadNoteImage(session, path, name, req.body ?? new Uint8Array(), length) })
  } catch (err) {
    if (err instanceof NextcloudAuthError) return jsonError('Your session has expired.', 401)
    return jsonError(err instanceof NextcloudError ? err.message : 'Upload failed.', 502)
  }
}
