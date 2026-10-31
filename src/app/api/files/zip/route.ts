import { type NextRequest } from 'next/server'
import { NextcloudAuthError, NextcloudError } from '@/lib/nextcloud/http'
import { zipResponse } from '@/lib/nextcloud/files'
import { getSession } from '@/lib/session'

/** A zip of a folder (`?dir=`) or of some of its items (`&name=a&name=b`). */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const dir = req.nextUrl.searchParams.get('dir') ?? '/'
  const names = req.nextUrl.searchParams.getAll('name')
  try {
    const res = await zipResponse(session, dir, names)
    const base = names.length === 1 ? names[0] : dir.split('/').filter(Boolean).pop() || 'Files'
    return new Response(res.body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(base + '.zip')}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    if (err instanceof NextcloudAuthError) return new Response('Unauthorized', { status: 401 })
    return new Response(err instanceof NextcloudError ? err.message : 'Download failed.', { status: 502 })
  }
}
