import { SpaceSidebar } from '@/components/space/SpaceSidebar'
import { nextcloudPublicUrl } from '@/lib/env'
import { loadSpace, loadSpacePages } from '@/lib/loaders'
import { toLite } from '@/lib/pageTree'

export async function generateMetadata({ params }: { params: Promise<{ collectiveId: string }> }) {
  const space = await loadSpace(Number((await params).collectiveId))
  return { title: space.name }
}

export default async function SpaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ collectiveId: string }> }) {
  const id = Number((await params).collectiveId)
  const [space, pages] = await Promise.all([loadSpace(id), loadSpacePages(id)])
  return (
    <div className="with-sidebar">
      <SpaceSidebar
        space={{ id: space.id, name: space.name, emoji: space.emoji }}
        pages={pages.map(toLite)}
        canEdit={space.canEdit}
        canManage={space.level >= 4}
        nextcloudHref={`${nextcloudPublicUrl()}/apps/collectives/${encodeURIComponent(space.slug ? `${space.slug}-${space.id}` : space.name)}`}
      />
      <main className="main">{children}</main>
    </div>
  )
}
