'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  createUser,
  deleteUser,
  loadUsers,
  resendInvite,
  setUserEnabled,
  setUserGroup,
  setUserPassword,
  setUserSubadmin,
  updateUser,
} from '@/app/(app)/admin/actions'
import { fmtRelative } from '@/lib/format'
import type { AdminGroup, AdminScope, AdminUser } from '@/lib/nextcloud/admin'
import { fmtSize } from '../attachments/upload'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { Modal } from '../Modal'

const QUOTAS: { value: string; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: '1 GB', label: '1 GB' },
  { value: '5 GB', label: '5 GB' },
  { value: '10 GB', label: '10 GB' },
  { value: '50 GB', label: '50 GB' },
  { value: '100 GB', label: '100 GB' },
  { value: 'none', label: 'Unlimited' },
]
const PAGE = 50

/** A random password that satisfies Nextcloud's default policy. */
function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?'
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

const quotaLabel = (u: AdminUser) => {
  const q = u.quota.quota
  const used = fmtSize(u.quota.used ?? 0) || '0 B'
  if (q === undefined || q === 'none' || (typeof q === 'number' && q < 0)) return `${used} used`
  return `${used} of ${typeof q === 'number' ? fmtSize(q) : q}`
}

export function UsersClient({
  me,
  scope,
  initialUsers,
  groups,
  initialGroup,
  initialSearch,
}: {
  me: string
  scope: AdminScope
  initialUsers: AdminUser[]
  groups: AdminGroup[]
  initialGroup: string
  initialSearch: string
}) {
  const pathname = usePathname()
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState(initialSearch)
  const [group, setGroup] = useState(initialGroup)
  const [more, setMore] = useState(initialUsers.length >= PAGE)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const seq = useRef(0)
  const first = useRef(true)

  // Search as you type; the filter is mirrored in the URL so it can be linked.
  useEffect(() => {
    if (first.current) return void (first.current = false)
    const mine = ++seq.current
    const t = setTimeout(async () => {
      const r = await loadUsers({ search, group })
      if (mine !== seq.current) return
      if (!r.ok) return setError(r.error)
      setUsers(r.data)
      setMore(r.data.length >= PAGE)
      const qs = new URLSearchParams({ ...(group ? { group } : {}), ...(search ? { q: search } : {}) }).toString()
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname)
    }, 250)
    return () => clearTimeout(t)
  }, [search, group, pathname])

  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.displayname])), [groups])
  const assignable = scope.isAdmin ? groups : groups.filter((g) => scope.subadminOf.includes(g.id))
  const open = users.find((u) => u.id === openId) ?? null
  const replace = (u: AdminUser) => setUsers((all) => all.map((x) => (x.id === u.id ? u : x)))

  return (
    <div className="admin-page">
      <div className="page-header">
        <div className="page-title-row">
          <h1>Users</h1>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add user
          </button>
        </div>
        <div className="filter-bar">
          <label className="search-input">
            <Icon name="search" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, username or email" aria-label="Search users" />
          </label>
          <select className="filter-select" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group">
            <option value="">{scope.isAdmin ? 'All users' : 'All my groups'}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.displayname} ({g.usercount})
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <div className="banner banner-error">{error}</div>}
      <div className="table-wrap">
        <table className="data-table users-table">
          <thead>
            <tr>
              <th>User</th>
              <th className="hide-sm">Email</th>
              <th className="hide-md">Groups</th>
              <th className="col-date hide-sm">Last login</th>
              <th className="hide-md">Storage</th>
              <th className="col-status">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`row-link${u.enabled ? '' : ' is-disabled'}`} onClick={() => setOpenId(u.id)}>
                <td>
                  <span className="person">
                    <Avatar uid={u.id} name={u.displayname} size={32} />
                    <span className="person-lines">
                      <button className="row-title" onClick={() => setOpenId(u.id)}>
                        {u.displayname}
                      </button>
                      <small className="muted">{u.id}</small>
                    </span>
                  </span>
                </td>
                <td className="hide-sm muted">{u.email ?? '—'}</td>
                <td className="hide-md">
                  <span className="chip-list">
                    {u.groups.slice(0, 3).map((g) => (
                      <span key={g} className="group-chip">
                        {groupName.get(g) ?? g}
                      </span>
                    ))}
                    {u.groups.length > 3 && <span className="muted small">+{u.groups.length - 3}</span>}
                  </span>
                </td>
                <td className="col-date hide-sm muted">{u.lastLogin ? fmtRelative(u.lastLogin) : 'Never'}</td>
                <td className="hide-md muted small">{quotaLabel(u)}</td>
                <td className="col-status">
                  <span className="chip-list">
                    {!u.enabled && <span className="lozenge lozenge-removed">Disabled</span>}
                    {u.groups.includes('admin') && <span className="lozenge lozenge-new">Admin</span>}
                    {u.subadmin.length > 0 && <span className="lozenge lozenge-moved">Group admin</span>}
                    {u.enabled && !u.groups.includes('admin') && !u.subadmin.length && <span className="lozenge lozenge-success">Active</span>}
                  </span>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-cell">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {more && (
        <div className="table-foot">
          <button
            className="btn btn-default"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await loadUsers({ search, group, offset: users.length })
                if (!r.ok) return setError(r.error)
                setUsers((all) => [...all, ...r.data.filter((u) => !all.some((x) => x.id === u.id))])
                setMore(r.data.length >= PAGE)
              })
            }
          >
            {pending ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {adding && (
        <AddUserModal
          scope={scope}
          groups={assignable}
          defaultGroup={group}
          onClose={() => setAdding(false)}
          onCreated={(u) => {
            setUsers((all) => [u, ...all])
            setAdding(false)
            setOpenId(u.id)
          }}
        />
      )}
      {open && (
        <UserPanel
          user={open}
          me={me}
          scope={scope}
          groups={groups}
          assignable={assignable}
          onChange={replace}
          onDeleted={() => {
            setUsers((all) => all.filter((x) => x.id !== open.id))
            setOpenId(null)
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

function GroupPicker({ value, options, onChange }: { value: string[]; options: AdminGroup[]; onChange: (v: string[]) => void }) {
  const rest = options.filter((g) => !value.includes(g.id))
  const name = (id: string) => options.find((g) => g.id === id)?.displayname ?? id
  return (
    <div className="chip-list">
      {value.map((g) => (
        <span key={g} className="group-chip group-chip-removable">
          {name(g)}
          <button type="button" aria-label={`Remove ${name(g)}`} onClick={() => onChange(value.filter((x) => x !== g))}>
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
      {rest.length > 0 && (
        <select className="filter-select" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} aria-label="Add to group">
          <option value="">+ Add group</option>
          {rest.map((g) => (
            <option key={g.id} value={g.id}>
              {g.displayname}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function AddUserModal({
  scope,
  groups,
  defaultGroup,
  onClose,
  onCreated,
}: {
  scope: AdminScope
  groups: AdminGroup[]
  defaultGroup: string
  onClose: () => void
  onCreated: (u: AdminUser) => void
}) {
  const [id, setId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<'invite' | 'password'>('invite')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [userGroups, setUserGroups] = useState<string[]>(() => (defaultGroup && groups.some((g) => g.id === defaultGroup) ? [defaultGroup] : scope.isAdmin ? [] : groups.slice(0, 1).map((g) => g.id)))
  const [quota, setQuota] = useState('default')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const idTouched = useRef(false)

  // Suggest a username from the name until the admin types one.
  useEffect(() => {
    if (!idTouched.current) setId(displayName.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._@-]/g, ''))
  }, [displayName])

  const needsGroup = !scope.isAdmin && userGroups.length === 0
  const submit = () =>
    start(async () => {
      setError(null)
      const r = await createUser({ id, displayName, email, password: mode === 'password' ? password : null, groups: userGroups, quota })
      if (!r.ok) return setError(r.error)
      onCreated(r.data)
    })

  return (
    <Modal
      title="Add user"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={pending || !id || needsGroup || (mode === 'invite' ? !email : password.length < 1)}
          >
            {pending ? 'Creating…' : mode === 'invite' ? 'Create and send invite' : 'Create user'}
          </button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {error && <div className="banner banner-error">{error}</div>}
        <label className="field">
          <span>Full name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus maxLength={255} />
        </label>
        <div className="form-row">
          <label className="field">
            <span>
              Username <em className="req">*</em>
            </span>
            <input
              value={id}
              onChange={(e) => {
                idTouched.current = true
                setId(e.target.value)
              }}
              maxLength={64}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Email {mode === 'invite' && <em className="req">*</em>}</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </label>
        </div>
        <fieldset className="choice-group">
          <legend>Password</legend>
          <label className="check">
            <input type="radio" name="pwmode" checked={mode === 'invite'} onChange={() => setMode('invite')} />
            <span>
              <strong>Email an invite</strong>
              <small>They get a link to choose their own password.</small>
            </span>
          </label>
          <label className="check">
            <input
              type="radio"
              name="pwmode"
              checked={mode === 'password'}
              onChange={() => {
                setMode('password')
                if (!password) setPassword(generatePassword())
              }}
            />
            <span>
              <strong>Set a password now</strong>
              <small>Share it with them yourself; they can change it later.</small>
            </span>
          </label>
          {mode === 'password' && (
            <div className="password-row">
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" autoComplete="new-password" />
              <button type="button" className="btn btn-default btn-sm" onClick={() => setShow((s) => !s)}>
                {show ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="btn btn-default btn-sm"
                onClick={() => {
                  setPassword(generatePassword())
                  setShow(true)
                }}
              >
                Generate
              </button>
              <button type="button" className="btn btn-default btn-sm" onClick={() => navigator.clipboard?.writeText(password)}>
                Copy
              </button>
            </div>
          )}
        </fieldset>
        <div className="field">
          <span>Groups {!scope.isAdmin && <em className="req">*</em>}</span>
          <GroupPicker value={userGroups} options={groups} onChange={setUserGroups} />
          {needsGroup && <small className="hint">As a group admin, add the user to at least one of your groups.</small>}
        </div>
        <label className="field field-narrow">
          <span>Storage quota</span>
          <select value={quota} onChange={(e) => setQuota(e.target.value)}>
            {QUOTAS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">Nextcloud also sends a welcome email when you set a password. If an invite doesn’t arrive, use “Resend invite” on the user.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function UserPanel({
  user,
  me,
  scope,
  groups,
  assignable,
  onChange,
  onDeleted,
  onClose,
}: {
  user: AdminUser
  me: string
  scope: AdminScope
  groups: AdminGroup[]
  assignable: AdminGroup[]
  onChange: (u: AdminUser) => void
  onDeleted: () => void
  onClose: () => void
}) {
  const [displayName, setDisplayName] = useState(user.displayname)
  const [email, setEmail] = useState(user.email ?? '')
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const isMe = user.id === me
  const isAdminUser = user.groups.includes('admin')
  const canName = user.backendCapabilities?.setDisplayName !== false
  const canPassword = user.backendCapabilities?.setPassword !== false
  const quotaValue = typeof user.quota.quota === 'string' ? user.quota.quota : QUOTAS.find((q) => q.value !== 'default' && q.value !== 'none' && fmtSize(user.quota.quota as number) === q.label)?.value ?? 'default'

  useEffect(() => {
    setDisplayName(user.displayname)
    setEmail(user.email ?? '')
  }, [user.id, user.displayname, user.email])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const act = (fn: () => Promise<{ ok: true; data: AdminUser | null } | { ok: false; error: string }>, ok: string) =>
    start(async () => {
      setMessage(null)
      const r = await fn()
      if (!r.ok) return setMessage({ ok: false, text: r.error })
      if (r.data) onChange(r.data)
      setMessage({ ok: true, text: ok })
    })

  // Group membership: only groups this admin may assign can be added/removed.
  const visibleGroups = scope.isAdmin ? user.groups : user.groups.filter((g) => scope.subadminOf.includes(g))
  const otherGroups = user.groups.filter((g) => !visibleGroups.includes(g))

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={user.displayname}>
        <div className="drawer-head">
          <Avatar uid={user.id} name={user.displayname} size={48} />
          <div className="drawer-title">
            <h2>{user.displayname}</h2>
            <span className="muted">
              {user.id}
              {isMe && ' (you)'}
            </span>
            <span className="chip-list">
              {!user.enabled && <span className="lozenge lozenge-removed">Disabled</span>}
              {isAdminUser && <span className="lozenge lozenge-new">Admin</span>}
              {user.subadmin.length > 0 && <span className="lozenge lozenge-moved">Group admin</span>}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer-body">
          {message && <div className={`banner ${message.ok ? 'banner-success' : 'banner-error'}`}>{message.text}</div>}

          <section className="drawer-section">
            <h3>Profile</h3>
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault()
                act(() => updateUser(user.id, { displayname: displayName, email }), 'Profile saved.')
              }}
            >
              <label className="field">
                <span>Full name</span>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={!canName} />
              </label>
              <label className="field">
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <div>
                <button className="btn btn-primary btn-sm" disabled={pending || (displayName === user.displayname && email === (user.email ?? ''))}>
                  Save profile
                </button>
              </div>
            </form>
          </section>

          <section className="drawer-section">
            <h3>Groups</h3>
            <GroupPicker
              value={visibleGroups}
              options={assignable.length ? [...assignable, ...groups.filter((g) => visibleGroups.includes(g.id) && !assignable.includes(g))] : groups}
              onChange={(next) => {
                const added = next.find((g) => !visibleGroups.includes(g))
                const removed = visibleGroups.find((g) => !next.includes(g))
                if (added) act(() => setUserGroup(user.id, added, true), 'Added to group.')
                else if (removed) {
                  if (removed === 'admin' && isMe) return setMessage({ ok: false, text: 'You can’t remove your own admin rights.' })
                  act(() => setUserGroup(user.id, removed, false), 'Removed from group.')
                }
              }}
            />
            {otherGroups.length > 0 && <p className="hint">Also in {otherGroups.length} group(s) you don’t manage.</p>}
          </section>

          {scope.isAdmin && (
            <section className="drawer-section">
              <h3>Administration rights</h3>
              <label className="check">
                <input
                  type="checkbox"
                  checked={isAdminUser}
                  disabled={pending || isMe}
                  onChange={(e) => {
                    const on = e.target.checked
                    if (on && !confirm(`Make ${user.displayname} a Nextcloud admin? Admins can manage every user, group and setting.`)) return
                    act(() => setUserGroup(user.id, 'admin', on), on ? 'Now an admin.' : 'Admin rights removed.')
                  }}
                />
                <span>
                  <strong>Nextcloud admin</strong>
                  <small>{isMe ? 'You can’t remove your own admin rights.' : 'Full control of users, groups and server settings.'}</small>
                </span>
              </label>
              <div className="field">
                <span>Group admin of</span>
                <GroupPicker
                  value={user.subadmin}
                  options={groups.filter((g) => g.id !== 'admin')}
                  onChange={(next) => {
                    const added = next.find((g) => !user.subadmin.includes(g))
                    const removed = user.subadmin.find((g) => !next.includes(g))
                    if (added) act(() => setUserSubadmin(user.id, added, true), 'Group admin rights added.')
                    else if (removed) act(() => setUserSubadmin(user.id, removed, false), 'Group admin rights removed.')
                  }}
                />
                <small className="hint">Group admins can add and manage users in these groups.</small>
              </div>
            </section>
          )}

          <section className="drawer-section">
            <h3>Storage</h3>
            <div className="form-row">
              <label className="field">
                <span>Quota</span>
                <select value={quotaValue} disabled={pending} onChange={(e) => act(() => updateUser(user.id, { quota: e.target.value }), 'Quota saved.')}>
                  {QUOTAS.map((q) => (
                    <option key={q.value} value={q.value}>
                      {q.label}
                    </option>
                  ))}
                  {!QUOTAS.some((q) => q.value === quotaValue) && <option value={quotaValue}>{quotaValue}</option>}
                </select>
              </label>
              <div className="field">
                <span>Used</span>
                <div className="muted">{quotaLabel(user)}</div>
              </div>
            </div>
          </section>

          <section className="drawer-section">
            <h3>Account</h3>
            <p className="muted small">
              Last login: {user.lastLogin ? fmtRelative(user.lastLogin) : 'never'} · Account type: {user.backend}
            </p>
            <div className="btn-row wrap">
              {user.email && (
                <button className="btn btn-default btn-sm" disabled={pending} onClick={() => act(() => resendInvite(user.id), `Invite sent to ${user.email}.`)}>
                  Resend invite
                </button>
              )}
              {canPassword && newPassword === null && (
                <button className="btn btn-default btn-sm" onClick={() => setNewPassword(generatePassword())}>
                  Set new password
                </button>
              )}
              {!isMe && (
                <button
                  className="btn btn-default btn-sm"
                  disabled={pending}
                  onClick={() => act(() => setUserEnabled(user.id, !user.enabled), user.enabled ? 'Account disabled. They can’t log in any more.' : 'Account enabled.')}
                >
                  {user.enabled ? 'Disable account' : 'Enable account'}
                </button>
              )}
            </div>
            {newPassword !== null && (
              <div className="password-row">
                <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} aria-label="New password" autoComplete="new-password" />
                <button type="button" className="btn btn-default btn-sm" onClick={() => setNewPassword(generatePassword())}>
                  Generate
                </button>
                <button type="button" className="btn btn-default btn-sm" onClick={() => navigator.clipboard?.writeText(newPassword)}>
                  Copy
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={pending || !newPassword}
                  onClick={() =>
                    start(async () => {
                      const r = await setUserPassword(user.id, newPassword)
                      if (!r.ok) return setMessage({ ok: false, text: r.error })
                      setNewPassword(null)
                      setMessage({ ok: true, text: 'Password changed. Share it with them securely.' })
                    })
                  }
                >
                  Save password
                </button>
              </div>
            )}
          </section>

          {!isMe && (
            <section className="drawer-section danger-zone">
              <h3>Delete user</h3>
              <p className="muted small">Deletes the account and all of its files in Nextcloud. This can’t be undone; disabling is often better.</p>
              <button
                className="btn btn-danger btn-sm"
                disabled={pending}
                onClick={() => {
                  if (prompt(`Type the username (${user.id}) to delete this user and all their files.`) !== user.id) return
                  start(async () => {
                    const r = await deleteUser(user.id)
                    if (!r.ok) return setMessage({ ok: false, text: r.error })
                    onDeleted()
                  })
                }}
              >
                Delete user
              </button>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
