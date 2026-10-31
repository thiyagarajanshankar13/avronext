import { type NextRequest } from 'next/server'
import { cleanFileName, jsonError, maxUploadBytes, sameOrigin } from '@/lib/files'
import { attachmentsDirName, deletePageAttachment, getPage, uploadPageAttachment } from '@/lib/nextcloud/collectives'
import { NextcloudAuthError, NextcloudError } from '@/lib/nextcloud/http'
import { getSession } from '@/lib/session'

type Params = { params: Promise<{ collectiveId: string; pageId: string }> }

async function ids(params: Params['params']) {
  const p = await params
  const cid = Number(p.collectiveId)
  const pid = Number(p.pageId)
  return Number.isInteger(cid) && cid > 0 && Number.isInteger(pid) && pid > 0 ? { cid, pid } : null
}

function fail(err: unknown, what: string) {
  if (err instanceof NextcloudAuthError) return jsonError('Your session has expired.', 401)
  return jsonError(err instanceof NextcloudError ? err.message : `${what} failed.`, 502)
}

/**
 * Attach one file to a page (multipart `file`). Returns the stored name and
 * the page-relative path to use in Markdown, e.g. `.attachments.12/a%20b.png`.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return jsonError('Your session has expired.', 401)
  if (!sameOrigin(req)) return jsonError('Forbidden', 403)
  const p = await ids(params)
  if (!p) return jsonError('Bad request', 400)
  const limit = maxUploadBytes()
  if (Number(req.headers.get('content-length')) > limit + 64 * 1024) return jsonError(`Files can be at most ${Math.round(limit / 1048576)} MB.`, 413)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return jsonError('No file was sent.', 400)
  if (file.size > limit) return jsonError(`Files can be at most ${Math.round(limit / 1048576)} MB.`, 413)
  try {
    const page = await getPage(session, p.cid, p.pid)
    const name = await uploadPageAttachment(session, page, cleanFileName(file.name), file)
    // Parentheses encoded too, so the Markdown link survives any parser (Nextcloud Text included).
    const href = `${attachmentsDirName(page)}/${encodeURIComponent(name).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
    return Response.json({ name, href, mimetype: file.type })
  } catch (err) {
    return fail(err, 'Upload')
  }
}

/** Delete an attachment: `?name=`. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return jsonError('Your session has expired.', 401)
  if (!sameOrigin(req)) return jsonError('Forbidden', 403)
  const p = await ids(params)
  const name = req.nextUrl.searchParams.get('name') ?? ''
  if (!p || !name || cleanFileName(name) !== name) return jsonError('Bad request', 400)
  try {
    await deletePageAttachment(session, await getPage(session, p.cid, p.pid), name)
    return Response.json({ ok: true })
  } catch (err) {
    return fail(err, 'Delete')
  }
}
