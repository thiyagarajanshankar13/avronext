import 'server-only'
import type { Session } from '../session'
import { ocs } from './http'

/**
 * Nextcloud Teams (the Circles app). Collectives keep their members in a team,
 * so space membership is team membership.
 */
const APP = 'Teams'

/** 1 member, 4 moderator, 8 admin, 9 owner. */
export type TeamLevel = 1 | 4 | 8 | 9

export type TeamMember = {
  id: string
  /** User id, group id or team id, depending on `kind`. */
  memberId: string
  kind: 'user' | 'group' | 'team'
  displayName: string
  level: TeamLevel
}

type RawMember = {
  id: string
  userId: string
  userType: number
  level: number
  displayName?: string
  basedOn?: { source?: number; displayName?: string }
}

// Circles member types: 1 user, 2 group (shown as 16 + basedOn.source 2), 16 team.
const kindOf = (m: RawMember): TeamMember['kind'] => {
  const source = m.basedOn?.source ?? m.userType
  return source === 1 ? 'user' : source === 2 ? 'group' : 'team'
}

export async function listTeamMembers(s: Session, teamId: string): Promise<TeamMember[]> {
  const raw = await ocs<RawMember[]>(s, `/apps/circles/circles/${encodeURIComponent(teamId)}/members`, { app: APP })
  return raw.map((m) => ({
    id: m.id,
    memberId: m.userId,
    kind: kindOf(m),
    displayName: m.basedOn?.displayName || m.displayName || m.userId,
    level: (m.level >= 9 ? 9 : m.level >= 8 ? 8 : m.level >= 4 ? 4 : 1) as TeamLevel,
  }))
}

const TYPE = { user: 1, group: 2, team: 16 } as const

export async function addTeamMember(s: Session, teamId: string, kind: TeamMember['kind'], memberId: string): Promise<string> {
  const added = await ocs<{ id?: string }>(s, `/apps/circles/circles/${encodeURIComponent(teamId)}/members`, {
    method: 'POST',
    body: { userId: memberId, type: TYPE[kind] },
    app: APP,
  })
  return added?.id ?? ''
}

export const setTeamMemberLevel = (s: Session, teamId: string, id: string, level: 1 | 4 | 8) =>
  ocs<unknown>(s, `/apps/circles/circles/${encodeURIComponent(teamId)}/members/${encodeURIComponent(id)}/level`, { method: 'PUT', body: { level }, app: APP })

export const removeTeamMember = (s: Session, teamId: string, id: string) =>
  ocs<unknown>(s, `/apps/circles/circles/${encodeURIComponent(teamId)}/members/${encodeURIComponent(id)}`, { method: 'DELETE', app: APP })
