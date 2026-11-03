import { ShareTarget } from '@/components/ShareTarget'
import { loadOrSignOut } from '@/lib/nextcloud/http'
import { requireSession } from '@/lib/session'
import { loadWorkspace } from '@/lib/workspace'

export const metadata = { title: 'Save to AvroNext' }

/** Where the Android share sheet lands (via the service worker): pick Files, a note or an issue. */
export default async function SharePage() {
  const session = await requireSession()
  const ws = await loadOrSignOut(() => loadWorkspace(session))
  return <ShareTarget uid={session.userId} projects={ws.boards.filter((b) => b.permissions.PERMISSION_EDIT).map((b) => ({ id: b.id, title: b.title }))} />
}
