import { redirect } from 'next/navigation'
import { ProjectSettingsClient } from '@/components/project/ProjectSettingsClient'
import { loadBoard } from '@/lib/loaders'
import { requireSession } from '@/lib/session'

export default async function ProjectSettingsPage({ params }: { params: Promise<{ boardId: string }> }) {
  const [session, board] = await Promise.all([requireSession(), loadBoard(Number((await params).boardId))])
  if (!board.permissions.PERMISSION_MANAGE) redirect(`/projects/${board.id}`)
  return <ProjectSettingsClient board={board} me={session.userId} />
}
