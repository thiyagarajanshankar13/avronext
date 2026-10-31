import { NavProgress } from '@/components/NavProgress'
import { TopNav } from '@/components/TopNav'
import { RefreshOnArrival } from '@/lib/useGoFresh'
import { nextcloudPublicUrl } from '@/lib/env'
import { getAdminScope } from '@/lib/nextcloud/admin'
import { loadOrSignOut, NextcloudAuthError } from '@/lib/nextcloud/http'
import { requireSession } from '@/lib/session'
import { loadWorkspace } from '@/lib/workspace'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const [ws, scope] = await loadOrSignOut(() =>
    Promise.all([
      loadWorkspace(session),
      // Only decides whether the menu shows "Administration"; never block the app on it.
      getAdminScope(session).catch((err) => {
        if (err instanceof NextcloudAuthError) throw err
        return { isAdmin: false, subadminOf: [] }
      }),
    ]),
  )
  return (
    <div className="app">
      <NavProgress />
      <TopNav
        user={{ uid: session.userId, name: session.displayName }}
        nextcloudUrl={nextcloudPublicUrl()}
        canAdminister={scope.isAdmin || scope.subadminOf.length > 0}
        projects={ws.boards.map((b) => ({ id: b.id, title: b.title, color: b.color }))}
        spaces={ws.collectives.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))}
      />
      <div className="app-body">{children}</div>
      <RefreshOnArrival />
    </div>
  )
}
