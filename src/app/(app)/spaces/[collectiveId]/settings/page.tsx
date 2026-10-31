import { redirect } from 'next/navigation'
import { SpaceSettingsClient } from '@/components/space/SpaceSettingsClient'
import { loadSpace } from '@/lib/loaders'
import { loadOrSignOut } from '@/lib/nextcloud/http'
import { listTeamMembers } from '@/lib/nextcloud/teams'
import { requireSession } from '@/lib/session'

export const metadata = { title: 'Space settings' }

/** Moderators and admins of the space (team levels 4+) manage it here. */
export default async function SpaceSettingsPage({ params }: { params: Promise<{ collectiveId: string }> }) {
  const cid = Number((await params).collectiveId)
  const [session, space] = await Promise.all([requireSession(), loadSpace(cid)])
  if (space.level < 4 || !space.circleId) redirect(`/spaces/${cid}`)
  const members = await loadOrSignOut(() => listTeamMembers(session, space.circleId!))
  return (
    <SpaceSettingsClient
      space={{
        id: space.id,
        name: space.name,
        emoji: space.emoji,
        level: space.level,
        editLevel: space.editPermissionLevel ?? 1,
        shareLevel: space.sharePermissionLevel ?? 1,
      }}
      initialMembers={members}
      me={session.userId}
    />
  )
}
