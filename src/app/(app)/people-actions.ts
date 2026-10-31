'use server'

import { run } from '@/lib/actions'
import { searchPeople as search, type PersonKind } from '@/lib/nextcloud/people'

/** People picker search (users, groups, teams), using Nextcloud's sharing search and rules. */
export async function searchPeople(query: string, kinds: PersonKind[]) {
  return run((s) => search(s, String(query).slice(0, 100), kinds.filter((k) => ['user', 'group', 'team'].includes(k))))
}
