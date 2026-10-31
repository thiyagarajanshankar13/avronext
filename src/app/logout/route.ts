import { NextResponse, type NextRequest } from 'next/server'
import { revokeAppPassword } from '@/lib/nextcloud/user'
import { clearSession, getSession } from '@/lib/session'

/** POST = sign out (revokes the app password in Nextcloud). */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session) await revokeAppPassword(session.loginName, session.appPassword)
  await clearSession()
  return NextResponse.redirect(new URL('/login', req.url), 303)
}

/** GET = the app password stopped working; just forget it. */
export async function GET(req: NextRequest) {
  await clearSession()
  const url = new URL('/login', req.url)
  if (req.nextUrl.searchParams.get('expired')) url.searchParams.set('expired', '1')
  return NextResponse.redirect(url)
}
