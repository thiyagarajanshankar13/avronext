import { redirect } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { getSession } from '@/lib/session'
import { LoginClient } from './LoginClient'

export const metadata = { title: 'Log in' }

function safeNext(next: string | undefined) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/'
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string }> }) {
  const { next, expired } = await searchParams
  if (await getSession()) redirect(safeNext(next))
  const host = (() => {
    try {
      return new URL(process.env.NEXTCLOUD_PUBLIC_URL || process.env.NEXTCLOUD_URL || '').host
    } catch {
      return null
    }
  })()
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <Logo size={32} />
        </div>
        <h1>Log in to continue</h1>
        <p className="login-sub">
          Use your Nextcloud account{host ? <> on <strong>{host}</strong></> : null}.
        </p>
        {expired && <div className="banner banner-warn">Your session expired. Please log in again.</div>}
        {!host && <div className="banner banner-error">NEXTCLOUD_URL is not configured on the server.</div>}
        <LoginClient next={safeNext(next)} />
      </div>
      <p className="login-foot">AvroNext keeps nothing on its own server: your work lives in Nextcloud.</p>
    </main>
  )
}
