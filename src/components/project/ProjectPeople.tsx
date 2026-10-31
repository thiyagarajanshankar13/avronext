'use client'
import { useMemo, useState } from 'react'
import { addProjectPeople, removeProjectPerson, setProjectRole, type ProjectRole } from '@/app/(app)/projects/actions'
import type { DeckAcl, DeckBoard } from '@/lib/nextcloud/deck'
import { PeopleList, type PersonRow } from '../people/PeopleList'
import { PeoplePicker, type RoleOption } from '../people/PeoplePicker'

const ROLES: RoleOption<ProjectRole>[] = [
  { value: 'viewer', label: 'Viewer', hint: 'Viewers can see the project and its issues.' },
  { value: 'member', label: 'Member', hint: 'Members can create, edit and move issues.' },
  { value: 'admin', label: 'Admin', hint: 'Admins can also add people and change project settings.' },
]

/** Deck permissions → the closest role (Deck allows combinations the roles don't name, e.g. edit + share). */
const roleOf = (a: DeckAcl): ProjectRole => (a.permissionManage ? 'admin' : a.permissionEdit ? 'member' : 'viewer')
const KIND = { 0: 'user', 1: 'group', 7: 'team' } as const

/** Jira-style project access on top of Deck board sharing. */
export function ProjectPeople({ board, me }: { board: DeckBoard; me: string }) {
  const [acl, setAcl] = useState<DeckAcl[]>(board.acl ?? [])
  const rows: PersonRow<ProjectRole>[] = useMemo(
    () => [
      { key: 'owner', kind: 'user', id: board.owner.uid, name: board.owner.displayname, fixedRole: 'Owner', isMe: board.owner.uid === me },
      ...acl.map((a) => ({
        key: String(a.id),
        kind: KIND[a.type] ?? 'user',
        id: a.participant.uid ?? a.participant.primaryKey,
        name: a.participant.displayname || a.participant.primaryKey,
        role: roleOf(a),
        isMe: a.type === 0 && (a.participant.uid ?? a.participant.primaryKey) === me,
      })),
    ],
    [acl, board.owner, me],
  )
  const exclude = useMemo(() => new Set([`user:${board.owner.uid}`, ...rows.map((r) => `${r.kind}:${r.id}`)]), [rows, board.owner.uid])

  return (
    <>
      <PeoplePicker
        kinds={['user', 'group', 'team']}
        roles={ROLES}
        defaultRole="member"
        exclude={exclude}
        onAdd={async (people, role) => {
          const r = await addProjectPeople(board.id, people.map(({ kind, id }) => ({ kind, id })), role)
          if (!r.ok) return r.error
          setAcl(r.data)
          return null
        }}
      />
      <PeopleList
        rows={rows}
        roles={ROLES}
        canEdit={(row) => !row.fixedRole}
        myDowngradeWarning="This changes your own access. If you are no longer an admin of this project, you won't be able to change its people or settings. Continue?"
        onRole={async (row, role) => {
          const r = await setProjectRole(board.id, Number(row.key), role)
          if (!r.ok) return r.error
          setAcl(r.data)
          return null
        }}
        onRemove={async (row) => {
          const r = await removeProjectPerson(board.id, Number(row.key))
          if (!r.ok) return r.error
          setAcl(r.data)
          return null
        }}
      />
      <p className="hint">Groups and teams give everyone in them this role. People also see projects shared with them in Nextcloud Deck.</p>
    </>
  )
}
