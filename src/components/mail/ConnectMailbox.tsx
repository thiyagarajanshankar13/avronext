'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { connectMailbox, reconnectMailbox } from '@/app/(app)/mail/actions'
import { Icon } from '../Icon'

/**
 * First visit to Mail (or "Add another mailbox" / "Reconnect"): email and
 * username come pre-filled (the username from MAIL_USERNAME, by default the
 * email) and can be changed; usually only the password is typed. The server
 * settings come from AvroNext's env; the password goes to Nextcloud Mail.
 */
export function ConnectMailbox({
  name,
  email: initialEmail,
  usernameTemplate,
  userId,
  server,
  reconnect,
  onDone,
  onCancel,
}: {
  name: string
  email: string
  /** MAIL_USERNAME (%EMAIL% / %USERID%). */
  usernameTemplate: string
  userId: string
  server: string
  reconnect?: { accountId: number; username: string; email: string }
  onDone?: () => void
  onCancel?: () => void
}) {
  const router = useRouter()
  const fill = (email: string) => usernameTemplate.replace(/%EMAIL%/g, email).replace(/%USERID%/g, userId)
  const [email, setEmail] = useState(reconnect?.email ?? initialEmail)
  const [username, setUsername] = useState(reconnect?.username ?? fill(initialEmail))
  // Until they edit the username themselves, it follows the email.
  const [usernameTouched, setUsernameTouched] = useState(Boolean(reconnect))
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      setError(null)
      const r = reconnect ? await reconnectMailbox(reconnect.accountId, username, password) : await connectMailbox({ name, email, username, password })
      if (!r.ok) return setError(r.error)
      setPassword('')
      if (onDone) onDone()
      else router.refresh()
    })

  return (
    <form
      className="mail-connect"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="mail-connect-icon">
        <Icon name="mail" size={28} />
      </div>
      <h1>{reconnect ? 'Reconnect your mailbox' : 'Connect your mailbox'}</h1>
      <p className="muted">
        {reconnect ? 'Enter your current mail password.' : 'Enter your mail password to see your email here.'} Your mailbox is on <strong>{server}</strong>.
      </p>
      {error && <div className="banner banner-error">{error}</div>}
      <label className="field">
        <span>Email address</span>
        <input
          type="email"
          value={email}
          disabled={Boolean(reconnect)}
          onChange={(e) => {
            setEmail(e.target.value)
            if (!usernameTouched) setUsername(fill(e.target.value.trim()))
          }}
          autoComplete="email"
          required
        />
      </label>
      <label className="field">
        <span>Username</span>
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            setUsernameTouched(true)
          }}
          autoComplete="username"
          required
        />
      </label>
      <label className="field">
        <span>Password</span>
        <div className="password-field">
          <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus required />
          <button type="button" className="link-btn small" onClick={() => setShow(!show)}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>
      <div className="btn-row">
        {onCancel && (
          <button type="button" className="btn btn-subtle" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn btn-primary" disabled={pending || !password || !username || !email}>
          {pending ? 'Connecting…' : reconnect ? 'Reconnect' : 'Connect'}
        </button>
      </div>
      <p className="hint">Your password is stored by Nextcloud Mail, the same as when you add a mailbox there.</p>
    </form>
  )
}
