'use client'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { addSpacePeople, removeSpacePerson, setSpaceIcon, setSpacePermission, setSpaceRole, trashSpace } from '@/app/(app)/spaces/actions'
import type { TeamMember } from '@/lib/nextcloud/teams'
import { useGoFresh } from '@/lib/useGoFresh'
import { PeopleList, type PersonRow } from '../people/PeopleList'
import { PeoplePicker, type RoleOption } from '../people/PeoplePicker'

type Level = 1 | 4 | 8

const ROLES: RoleOption<Level>[] = [
  { value: 1, label: 'Member', hint: 'Members can read the space and, unless restricted below, edit pages.' },
  { value: 4, label: 'Moderator', hint: 'Moderators can also add and remove members.' },
  { value: 8, label: 'Admin', hint: 'Admins can also change roles and the space’s settings.' },
]
const WHO: { value: Level; label: string }[] = [
  { value: 1, label: 'All members' },
  { value: 4, label: 'Moderators and admins' },
  { value: 8, label: 'Admins only' },
]
const EMOJIS = ['📘', '🛠️', '🚀', '📣', '💡', '📊', '🧭', '🎯', '🏠', '🧪', '📝', '🤝']

export function SpaceSettingsClient({
  space,
  initialMembers,
  me,
}: {
  space: { id: number; name: string; emoji: string | null; level: number; editLevel: number; shareLevel: number }
  initialMembers: TeamMember[]
  me: string
}) {
  const goFresh = useGoFresh()
  const [members, setMembers] = useState(initialMembers)
  const [perm, setPerm] = useState({ edit: space.editLevel, share: space.shareLevel })
  const [emoji, setEmoji] = useState(space.emoji)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const isAdmin = space.level >= 8

  const rows: PersonRow<Level>[] = useMemo(
    () =>
      [...members]
        .sort((a, b) => b.level - a.level || a.displayName.localeCompare(b.displayName))
        .map((m) => ({
          key: m.id,
          kind: m.kind,
          id: m.memberId,
          name: m.displayName,
          role: (m.level === 9 ? 8 : m.level) as Level,
          fixedRole: m.level === 9 ? 'Owner' : undefined,
          isMe: m.kind === 'user' && m.memberId === me,
        })),
    [members, me],
  )
  const exclude = useMemo(() => new Set(rows.map((r) => `${r.kind}:${r.id}`)), [rows])
  const levelOf = (row: PersonRow<Level>) => members.find((m) => m.id === row.key)?.level ?? 1

  const result = (r: { ok: boolean; error?: string }, ok: string) => setMessage(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? 'Failed' })

  return (
    <div className="settings-page">
      <div className="page-header">
        <div className="breadcrumbs">
          <Link prefetch={false} href="/spaces">
            Spaces
          </Link>
          <span className="sep">/</span>
          <Link prefetch={false} href={`/spaces/${space.id}`}>
            {space.name}
          </Link>
          <span className="sep">/</span>
          <span>Settings</span>
        </div>
        <h1>Space settings</h1>
      </div>
      {message && <div className={`banner ${message.ok ? 'banner-success' : 'banner-error'}`}>{message.text}</div>}

      {isAdmin && (
        <section className="settings-section">
          <h2>Icon</h2>
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className={`emoji-btn${emoji === e ? ' is-selected' : ''}`}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await setSpaceIcon(space.id, e)
                    if (r.ok) setEmoji(e)
                    result(r, 'Icon changed.')
                  })
                }
              >
                {e}
              </button>
            ))}
          </div>
          <p className="hint">The space is named “{space.name}”. Rename it in Nextcloud Collectives.</p>
        </section>
      )}

      <section className="settings-section">
        <h2>People</h2>
        <PeoplePicker
          kinds={['user', 'group', 'team']}
          // Moderators can add members; only admins hand out higher roles.
          roles={isAdmin ? ROLES : ROLES.slice(0, 1)}
          defaultRole={1}
          exclude={exclude}
          onAdd={async (people, level) => {
            const r = await addSpacePeople(space.id, people.map(({ kind, id }) => ({ kind, id })), level)
            if (!r.ok) return r.error
            setMembers(r.data)
            return null
          }}
        />
        <PeopleList
          rows={rows}
          roles={ROLES}
          // Admins manage everyone but the owner; moderators only plain members.
          canEdit={(row) => !row.fixedRole && (isAdmin || levelOf(row) < 4)}
          myDowngradeWarning="This changes your own access to this space. With a lower role you may not be able to manage it any more. Continue?"
          onRole={async (row, level) => {
            const r = await setSpaceRole(space.id, row.key, level)
            if (!r.ok) return r.error
            setMembers(r.data)
            return null
          }}
          onRemove={async (row) => {
            const r = await removeSpacePerson(space.id, row.key)
            if (!r.ok) return r.error
            setMembers(r.data)
            return null
          }}
        />
        <p className="hint">Members come from the space’s Nextcloud team, so changes here also show in Nextcloud Contacts › Teams.</p>
      </section>

      {isAdmin && (
        <section className="settings-section">
          <h2>Permissions</h2>
          <div className="form-stack narrow">
            {(
              [
                ['edit', 'Who can edit pages'],
                ['share', 'Who can share pages'],
              ] as const
            ).map(([which, label]) => (
              <label key={which} className="field">
                <span>{label}</span>
                <select
                  value={perm[which]}
                  disabled={pending}
                  onChange={(e) => {
                    const level = Number(e.target.value) as Level
                    start(async () => {
                      const r = await setSpacePermission(space.id, which, level)
                      if (r.ok) setPerm(r.data)
                      result(r, 'Permissions saved.')
                    })
                  }}
                >
                  {WHO.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="settings-section danger-zone">
          <h2>Move space to trash</h2>
          <p className="muted">The space and its pages go to the Collectives trash. A Nextcloud admin of the space can restore it there.</p>
          <button
            className="btn btn-danger"
            disabled={pending}
            onClick={() => {
              if (prompt(`Type the space name (${space.name}) to move it to the trash.`) !== space.name) return
              start(async () => {
                const r = await trashSpace(space.id)
                if (r.ok) goFresh('/spaces')
                else result(r, '')
              })
            }}
          >
            Move to trash
          </button>
        </section>
      )}
    </div>
  )
}
