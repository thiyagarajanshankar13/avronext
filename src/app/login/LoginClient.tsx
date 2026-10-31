'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { passwordLogin, pollLoginFlow, startLoginFlow } from './actions'

export function LoginClient({ next }: { next: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [pending, startTransition] = useTransition()
  const popup = useRef<Window | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const done = () => {
    popup.current?.close()
    router.replace(next)
  }

  const poll = async () => {
    const r = await pollLoginFlow()
    if (r.status === 'done') return done()
    if (r.status === 'error') {
      setWaiting(false)
      setError(r.error)
      return
    }
    timer.current = setTimeout(poll, 2000)
  }

  const startFlow = () => {
    setError(null)
    // Open synchronously (inside the click) so popup blockers allow it.
    const w = window.open('about:blank', 'avronext-login', 'width=600,height=720')
    startTransition(async () => {
      const r = await startLoginFlow()
      if (!r.ok) {
        w?.close()
        setError(r.error)
        return
      }
      if (w) {
        w.location.href = r.loginUrl
        popup.current = w
      } else {
        window.open(r.loginUrl, '_blank')
      }
      setWaiting(true)
      timer.current = setTimeout(poll, 2000)
    })
  }

  const submit = (fd: FormData) => {
    setError(null)
    startTransition(async () => {
      const r = await passwordLogin(fd)
      if (r.ok) done()
      else setError(r.error)
    })
  }

  return (
    <div className="login-actions">
      {error && <div className="banner banner-error">{error}</div>}
      {waiting ? (
        <div className="login-waiting">
          <span className="spinner" />
          <div>
            <strong>Waiting for Nextcloud…</strong>
            <p>Approve access in the window that opened. This page continues automatically.</p>
            <button className="btn btn-subtle" onClick={() => { if (timer.current) clearTimeout(timer.current); setWaiting(false) }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary btn-block btn-lg" onClick={startFlow} disabled={pending}>
          Continue with Nextcloud
        </button>
      )}
      <div className="login-divider">
        <span>or</span>
      </div>
      {showPassword ? (
        <form action={submit} className="form-stack">
          <label className="field">
            <span>Username</span>
            <input name="user" autoComplete="username" required autoFocus />
          </label>
          <label className="field">
            <span>Password or app password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn btn-default btn-block" disabled={pending}>
            {pending ? 'Logging in…' : 'Log in'}
          </button>
          <p className="hint">Accounts with two-factor authentication need an app password (Nextcloud › Settings › Security).</p>
        </form>
      ) : (
        <button className="btn btn-default btn-block" onClick={() => setShowPassword(true)}>
          Log in with username and password
        </button>
      )}
    </div>
  )
}
