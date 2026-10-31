import { notFound } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { nextcloudPublicUrl } from '@/lib/env'
import { getAdminScope } from '@/lib/nextcloud/admin'
import { loadOrSignOut } from '@/lib/nextcloud/http'
import { requireSession } from '@/lib/session'

export const metadata = { title: { default: 'Administration', template: '%s · Administration · AvroNext' } }

/** Nextcloud admins and group admins only; everyone else gets a 404. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const scope = await loadOrSignOut(() => getAdminScope(session))
  if (!scope.isAdmin && !scope.subadminOf.length) notFound()
  return (
    <div className="with-sidebar">
      <AdminSidebar isAdmin={scope.isAdmin} nextcloudUrl={nextcloudPublicUrl()} />
      <main className="main">{children}</main>
    </div>
  )
}
