import 'server-only'
import type { Session } from '../session'
import { ocs } from './http'

export type PersonKind = 'user' | 'group' | 'team'
export type PersonResult = { kind: PersonKind; id: string; label: string; sub?: string }

type Sharee = { label: string; shareWithDisplayNameUnique?: string; value: { shareType: number; shareWith: string } }
type ShareeData = Record<'users' | 'groups' | 'circles', Sharee[] | undefined> & { exact: Record<'users' | 'groups' | 'circles', Sharee[] | undefined> }

/**
 * People picker search: users, groups and teams the signed-in user may share
 * with (Nextcloud's sharee search, so its sharing rules apply).
 */
export async function searchPeople(s: Session, query: string, kinds: PersonKind[]): Promise<PersonResult[]> {
  const types = { user: 0, group: 1, team: 7 } as const
  const params = new URLSearchParams({ search: query, itemType: 'file', perPage: '15', lookup: 'false' })
  for (const k of kinds) params.append('shareType[]', String(types[k]))
  const data = await ocs<ShareeData>(s, `/apps/files_sharing/api/v1/sharees?${params}`)
  const pick = (list: Sharee[] | undefined, kind: PersonKind): PersonResult[] =>
    (list ?? []).map((x) => ({ kind, id: x.value.shareWith, label: x.label, sub: kind === 'user' ? (x.shareWithDisplayNameUnique ?? x.value.shareWith) : undefined }))
  const all = [
    ...pick(data.exact?.users, 'user'),
    ...pick(data.users, 'user'),
    ...pick(data.exact?.groups, 'group'),
    ...pick(data.groups, 'group'),
    ...pick(data.exact?.circles, 'team'),
    ...pick(data.circles, 'team'),
  ].filter((r) => kinds.includes(r.kind))
  const seen = new Set<string>()
  return all.filter((r) => !seen.has(`${r.kind}:${r.id}`) && seen.add(`${r.kind}:${r.id}`))
}
