'use client'
import { useEffect, useState } from 'react'
import { createLink, loadShares, removeShare, setShareRole, shareWithPeople, updateLink, type ShareRole } from '@/app/(app)/files/actions'
import type { FileRow } from '@/app/(app)/files/data'
import type { Share } from '@/lib/nextcloud/files'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import { PeopleList, type PersonRow } from '../people/PeopleList'
import { PeoplePicker, type PersonKind, type RoleOption } from '../people/PeoplePicker'
import { FileIcon } from './FileIcon'

const LINK = 3
const KIND: Record<number, PersonKind> = { 0: 'user', 1: 'group', 7: 'team' }
const roleOf = (s: Share): ShareRole => (s.permissions & 2 ? 'edit' : 'view')

export function ShareDialog({ item, onClose, onChanged }: { item: FileRow; onClose: () => void; onChanged: (shareTypes: number[]) => void }) {
  const [shares, setShares] = useState<Share[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const roles: RoleOption<ShareRole>[] = [
    { value: 'view', label: 'Can view', hint: item.isDir ? 'They can open and download everything in the folder.' : 'They can open and download it.' },
    { value: 'edit', label: 'Can edit', hint: item.isDir ? 'They can also add, change and delete files in the folder.' : 'They can also save changes to it.' },
  ]

  const apply = (list: Share[]) => {
    setShares(list)
    onChanged([...new Set(list.map((s) => s.type))])
  }

  useEffect(() => {
    loadShares(item.path).then((r) => (r.ok ? setShares(r.data) : setError(r.error)))
  }, [item.path])

  const people = (shares ?? []).filter((s) => s.type !== LINK)
  const links = (shares ?? []).filter((s) => s.type === LINK)

  const rows: PersonRow<ShareRole>[] = people.map((s) => ({
    key: s.id,
    kind: KIND[s.type] ?? 'user',
    id: s.shareWith,
    name: s.shareWithName,
    role: roleOf(s),
  }))

  const copy = async (s: Share) => {
    if (!s.url) return
    try {
      await navigator.clipboard.writeText(s.url)
      setCopied(s.id)
      setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 2000)
    } catch {
      window.prompt('Copy this link', s.url)
    }
  }

  const newLink = async () => {
    setError(null)
    const r = await createLink(item.path)
    if (!r.ok) return setError(r.error)
    apply([...(shares ?? []), r.data])
    copy(r.data)
  }

  const replace = (s: Share) => apply((shares ?? []).map((x) => (x.id === s.id ? s : x)))

  return (
    <Modal
      title={
        <span className="share-title">
          <FileIcon item={item} size={22} /> Share “{item.name}”
        </span>
      }
      onClose={onClose}
      width={600}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <h3 className="share-heading">People</h3>
      <PeoplePicker
        kinds={['user', 'group', 'team']}
        roles={roles}
        defaultRole="view"
        exclude={new Set(people.map((s) => `${KIND[s.type]}:${s.shareWith}`))}
        addLabel="Share"
        onAdd={async (picked, role) => {
          const r = await shareWithPeople(
            item.path,
            item.isDir,
            picked.map((p) => ({ kind: p.kind, id: p.id })),
            role,
          )
          if (!r.ok) return r.error
          apply(r.data.shares)
          return r.data.errors.length ? r.data.errors.join(' ') : null
        }}
      />
      {shares === null && !error && <p className="muted small">Loading…</p>}
      {shares && people.length === 0 && <p className="muted small share-none">Not shared with anyone yet.</p>}
      {people.length > 0 && (
        <PeopleList
          rows={rows}
          roles={roles}
          canEdit={() => true}
          myDowngradeWarning=""
          onRole={async (row, role) => {
            const r = await setShareRole(row.key, role, item.isDir, false)
            if (!r.ok) return r.error
            replace(r.data)
            return null
          }}
          onRemove={async (row) => {
            const r = await removeShare(row.key)
            if (!r.ok) return r.error
            apply((shares ?? []).filter((s) => s.id !== row.key))
            return null
          }}
        />
      )}

      <h3 className="share-heading">Links</h3>
      <p className="muted small">Anyone with a link can open it, without signing in.</p>
      {links.map((s) => (
        <LinkRow
          key={s.id}
          share={s}
          isDir={item.isDir}
          copied={copied === s.id}
          onCopy={() => copy(s)}
          onChange={replace}
          onRemove={() => apply((shares ?? []).filter((x) => x.id !== s.id))}
          onError={setError}
        />
      ))}
      <button className="btn btn-default" onClick={newLink} disabled={shares === null}>
        <Icon name="link" /> {links.length ? 'Create another link' : 'Create link'}
      </button>
      {error && <div className="banner banner-error">{error}</div>}
    </Modal>
  )
}

function LinkRow({
  share,
  isDir,
  copied,
  onCopy,
  onChange,
  onRemove,
  onError,
}: {
  share: Share
  isDir: boolean
  copied: boolean
  onCopy: () => void
  onChange: (s: Share) => void
  onRemove: () => void
  onError: (msg: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const act = async (fn: () => Promise<{ ok: true; data: Share } | { ok: false; error: string }>) => {
    setBusy(true)
    onError(null)
    const r = await fn()
    setBusy(false)
    if (!r.ok) return onError(r.error), false
    onChange(r.data)
    return true
  }

  return (
    <div className="share-link">
      <div className="share-link-row">
        <span className="share-link-icon">
          <Icon name="link" />
        </span>
        <span className="share-link-main">
          <strong>{share.label || 'Anyone with the link'}</strong>
          <small>
            {roleOf(share) === 'edit' ? (isDir ? 'Can view and upload' : 'Can edit') : 'Can view'}
            {share.hasPassword && ' · Password'}
            {share.expiration && ` · Expires ${new Date(share.expiration + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </small>
        </span>
        <button className="btn btn-default btn-sm" onClick={onCopy}>
          {copied ? <Icon name="check" /> : <Icon name="copy" />} {copied ? 'Copied' : 'Copy link'}
        </button>
        <button className="icon-btn icon-btn-sm" aria-label="Link settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="settings" />
        </button>
        <button
          className="icon-btn icon-btn-sm"
          aria-label="Delete link"
          title="Delete link"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const r = await removeShare(share.id)
            setBusy(false)
            if (!r.ok) return onError(r.error)
            onRemove()
          }}
        >
          <Icon name="trash" />
        </button>
      </div>
      {open && (
        <div className="share-link-settings">
          <label className="field">
            <span>People with the link</span>
            <select value={roleOf(share)} disabled={busy} onChange={(e) => act(() => setShareRole(share.id, e.target.value as ShareRole, isDir, true))}>
              <option value="view">Can view</option>
              <option value="edit">{isDir ? 'Can view and upload' : 'Can edit'}</option>
            </select>
          </label>
          <label className="field">
            <span>Expires</span>
            <input
              type="date"
              value={share.expiration ?? ''}
              min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
              disabled={busy}
              onChange={(e) => act(() => updateLink(share.id, { expireDate: e.target.value }))}
            />
          </label>
          <form
            className="share-link-password"
            onSubmit={async (e) => {
              e.preventDefault()
              if (await act(() => updateLink(share.id, { password }))) setPassword('')
            }}
          >
            <label className="field">
              <span>{share.hasPassword ? 'Change password' : 'Password'}</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={share.hasPassword ? '••••••••' : 'No password'} />
            </label>
            <button className="btn btn-default btn-sm" disabled={busy || !password}>
              <Icon name="lock" /> Set
            </button>
            {share.hasPassword && (
              <button type="button" className="btn btn-subtle btn-sm" disabled={busy} onClick={() => act(() => updateLink(share.id, { password: '' }))}>
                Remove
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
