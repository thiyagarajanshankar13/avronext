'use client'
import { useState } from 'react'
import { Icon } from '../Icon'
import { PersonIcon, type PersonKind, type RoleOption } from './PeoplePicker'

export type PersonRow<R extends string | number> = {
  key: string
  kind: PersonKind
  id: string
  name: string
  /** A fixed label (e.g. "Owner", "Custom") instead of the role dropdown. */
  fixedRole?: string
  role?: R
  isMe?: boolean
}

/** Who has access, with a role dropdown and remove button per row. */
export function PeopleList<R extends string | number>({
  rows,
  roles,
  canEdit,
  onRole,
  onRemove,
  myDowngradeWarning,
}: {
  rows: PersonRow<R>[]
  roles: RoleOption<R>[]
  canEdit: (row: PersonRow<R>) => boolean
  onRole: (row: PersonRow<R>, role: R) => Promise<string | null>
  onRemove: (row: PersonRow<R>) => Promise<string | null>
  /** Shown before you lower your own role or remove yourself. */
  myDowngradeWarning: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = async (row: PersonRow<R>, fn: () => Promise<string | null>) => {
    setBusy(row.key)
    setError(null)
    const err = await fn()
    setBusy(null)
    if (err) setError(err)
  }
  return (
    <>
      {error && <div className="banner banner-error">{error}</div>}
      <ul className="people-rows">
        {rows.map((row) => {
          const editable = canEdit(row)
          return (
            <li key={row.key} className={`people-row${busy === row.key ? ' is-busy' : ''}`}>
              <PersonIcon kind={row.kind} id={row.id} label={row.name} />
              <span className="people-row-name">
                <strong>
                  {row.name}
                  {row.isMe && <span className="muted"> (you)</span>}
                </strong>
                <small>{row.kind === 'user' ? row.id : row.kind === 'group' ? 'Group' : 'Team'}</small>
              </span>
              {row.fixedRole || !editable ? (
                <span className="lozenge lozenge-default people-role">{row.fixedRole ?? roles.find((r) => r.value === row.role)?.label}</span>
              ) : (
                <select
                  className="people-role-select"
                  value={String(row.role)}
                  aria-label={`Role for ${row.name}`}
                  disabled={busy === row.key}
                  onChange={(e) => {
                    const next = roles.find((r) => String(r.value) === e.target.value)!.value
                    if (row.isMe && !confirm(myDowngradeWarning)) return
                    act(row, () => onRole(row, next))
                  }}
                >
                  {roles.map((r) => (
                    <option key={String(r.value)} value={String(r.value)}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
              {editable && !row.fixedRole?.startsWith('Owner') ? (
                <button
                  type="button"
                  className="icon-btn"
                  title={`Remove ${row.name}`}
                  aria-label={`Remove ${row.name}`}
                  disabled={busy === row.key}
                  onClick={() => {
                    if (!confirm(row.isMe ? myDowngradeWarning : `Remove ${row.name}?`)) return
                    act(row, () => onRemove(row))
                  }}
                >
                  <Icon name="close" />
                </button>
              ) : (
                <span className="icon-btn-placeholder" />
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
