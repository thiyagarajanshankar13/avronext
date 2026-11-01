import { type NextRequest } from 'next/server'
import { revokeAppPassword } from '@/lib/nextcloud/user'
import { redirectTo } from '@/lib/redirect'
import { clearSession, getSession } from '@/lib/session'

/** POST = sign out (revokes the app password in Nextcloud). */
export async function POST() {
  const session = await getSession()
  if (session) await revokeAppPassword(session.loginName, session.appPassword)
  await clearSession()
  return redirectTo('/login', 303)
}

/** GET = the app password stopped working; just forget it. */
export async function GET(req: NextRequest) {
  await clearSession()
  return redirectTo(req.nextUrl.searchParams.get('expired') ? '/login?expired=1' : '/login')
}
