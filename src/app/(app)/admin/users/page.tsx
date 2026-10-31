import { notFound } from 'next/navigation'
import { UsersClient } from '@/components/admin/UsersClient'
import { getAdminScope, listGroups, listUsers } from '@/lib/nextcloud/admin'
import { loadOrSignOut } from '@/lib/nextcloud/http'
import { requireSession } from '@/lib/session'

export const metadata = { title: 'Users' }

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ group?: string; q?: string }> }) {
  const { group, q } = await searchParams
  const session = await requireSession()
  // Pages render alongside the layout, so check here too before asking Nextcloud for user data.
  const scope = await loadOrSignOut(() => getAdminScope(session))
  if (!scope.isAdmin && !scope.subadminOf.length) notFound()
  const [users, groups] = await loadOrSignOut(() => Promise.all([listUsers(session, { search: q, group, limit: 50 }), listGroups(session)]))
  return <UsersClient me={session.userId} scope={scope} initialUsers={users} groups={groups} initialGroup={group ?? ''} initialSearch={q ?? ''} />
}
