'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { createGroup, deleteGroup, renameGroup } from '@/app/(app)/admin/actions'
import type { AdminGroup } from '@/lib/nextcloud/admin'
import { Icon } from '../Icon'

export function GroupsClient({ isAdmin, initialGroups }: { isAdmin: boolean; initialGroups: AdminGroup[] }) {
  const [groups, setGroups] = useState(initialGroups)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [filter, setFilter] = useState('')
  const [pending, start] = useTransition()

  const act = (fn: () => Promise<{ ok: true; data: AdminGroup[] } | { ok: false; error: string }>, ok: string) =>
    start(async () => {
      setMessage(null)
      const r = await fn()
      if (!r.ok) return setMessage({ ok: false, text: r.error })
      setGroups(r.data)
      setMessage({ ok: true, text: ok })
    })

  const shown = groups.filter((g) => !filter || g.displayname.toLowerCase().includes(filter.toLowerCase()) || g.id.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="admin-page">
      <div className="page-header">
        <div className="page-title-row">
          <h1>Groups</h1>
        </div>
        <div className="filter-bar">
          <label className="search-input">
            <Icon name="search" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter groups" aria-label="Filter groups" />
          </label>
          {isAdmin && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (!name.trim()) return
                act(() => createGroup(name), `Group “${name.trim()}” created.`)
                setName('')
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New group name" maxLength={64} aria-label="New group name" />
              <button className="btn btn-primary" disabled={pending || !name.trim()}>
                <Icon name="plus" /> Create group
              </button>
            </form>
          )}
        </div>
      </div>
      {message && <div className={`banner ${message.ok ? 'banner-success' : 'banner-error'}`}>{message.text}</div>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Group</th>
              <th className="hide-sm">ID</th>
              <th>Members</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => (
              <tr key={g.id}>
                <td>
                  {editing?.id === g.id ? (
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault()
                        act(() => renameGroup(g.id, editing.name), 'Group renamed.')
                        setEditing(null)
                      }}
                    >
                      <input autoFocus value={editing.name} onChange={(e) => setEditing({ id: g.id, name: e.target.value })} maxLength={64} aria-label="Group name" />
                      <button className="btn btn-primary btn-sm">Save</button>
                      <button type="button" className="btn btn-subtle btn-sm" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <span className="person">
                      <span className="person-icon person-icon-group" style={{ width: 32, height: 32 }}>
                        <Icon name={g.id === 'admin' ? 'shield' : 'group'} size={17} />
                      </span>
                      <Link prefetch={false} href={`/admin/users?group=${encodeURIComponent(g.id)}`} className="row-title">
                        {g.displayname}
                      </Link>
                    </span>
                  )}
                </td>
                <td className="hide-sm muted">{g.id}</td>
                <td>
                  <Link prefetch={false} href={`/admin/users?group=${encodeURIComponent(g.id)}`}>
                    {g.usercount} {g.usercount === 1 ? 'member' : 'members'}
                  </Link>
                </td>
                <td className="row-actions">
                  {isAdmin && editing?.id !== g.id && (
                    <>
                      <button className="icon-btn" title="Rename" aria-label={`Rename ${g.displayname}`} onClick={() => setEditing({ id: g.id, name: g.displayname })}>
                        <Icon name="edit" />
                      </button>
                      {g.id !== 'admin' && (
                        <button
                          className="icon-btn"
                          title="Delete"
                          aria-label={`Delete ${g.displayname}`}
                          disabled={pending}
                          onClick={() =>
                            confirm(`Delete the group “${g.displayname}”? Its ${g.usercount} member(s) stay, but lose anything shared with the group.`) &&
                            act(() => deleteGroup(g.id), 'Group deleted.')
                          }
                        >
                          <Icon name="trash" />
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-cell">
                  No groups.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!isAdmin && <p className="hint">You’re a group admin of these groups. Only Nextcloud admins can create or delete groups.</p>}
    </div>
  )
}
