import { notFound } from 'next/navigation'
import { GroupsClient } from '@/components/admin/GroupsClient'
import { getAdminScope, listGroups } from '@/lib/nextcloud/admin'
import { loadOrSignOut } from '@/lib/nextcloud/http'
import { requireSession } from '@/lib/session'

export const metadata = { title: 'Groups' }

export default async function GroupsPage() {
  const session = await requireSession()
  // Pages render alongside the layout, so check here too before asking Nextcloud for group data.
  const scope = await loadOrSignOut(() => getAdminScope(session))
  if (!scope.isAdmin && !scope.subadminOf.length) notFound()
  const groups = await loadOrSignOut(() => listGroups(session))
  return <GroupsClient isAdmin={scope.isAdmin} initialGroups={groups} />
}
