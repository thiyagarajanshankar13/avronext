import { ProjectSidebar } from '@/components/project/ProjectSidebar'
import { nextcloudPublicUrl } from '@/lib/env'
import { loadBoard } from '@/lib/loaders'

export async function generateMetadata({ params }: { params: Promise<{ boardId: string }> }) {
  const board = await loadBoard(Number((await params).boardId))
  return { title: board.title }
}

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ boardId: string }> }) {
  const board = await loadBoard(Number((await params).boardId))
  return (
    <div className="with-sidebar">
      <ProjectSidebar board={{ id: board.id, title: board.title, color: board.color }} nextcloudUrl={nextcloudPublicUrl()} canManage={board.permissions.PERMISSION_MANAGE} />
      <main className="main">{children}</main>
    </div>
  )
}
