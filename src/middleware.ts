import { NextResponse, type NextRequest } from 'next/server'
import { publicUrl } from '@/lib/redirect'

const PUBLIC = ['/login', '/logout']

/** Cheap gate: no session cookie → login. The cookie itself is verified server-side. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next()
  if (req.cookies.has('avronext_session')) return NextResponse.next()
  if (pathname.startsWith('/api/')) return new NextResponse('Unauthorized', { status: 401 })
  return NextResponse.redirect(publicUrl(req, pathname === '/' ? '/login' : `/login?${new URLSearchParams({ next: pathname + search })}`))
}

export const config = {
  // Uploads skip middleware: Next buffers request bodies for middleware and
  // truncates big ones. Those routes check the session themselves.
  matcher: ['/((?!_next/|api/attachments/|api/upload|favicon.ico|icon.svg|robots.txt).*)'],
}
