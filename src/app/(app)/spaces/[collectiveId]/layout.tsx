import type { CSSProperties } from 'react'
import { cookies } from 'next/headers'
import { SpaceSidebar } from '@/components/space/SpaceSidebar'
import { nextcloudPublicUrl } from '@/lib/env'
import { loadSpace, loadSpacePages } from '@/lib/loaders'
import { toLite } from '@/lib/pageTree'
import { SIDEBAR_COOKIE, sidebarWidth } from '@/lib/sidebarWidth'

export async function generateMetadata({ params }: { params: Promise<{ collectiveId: string }> }) {
  const space = await loadSpace(Number((await params).collectiveId))
  return { title: space.name }
}

export default async function SpaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ collectiveId: string }> }) {
  const id = Number((await params).collectiveId)
  const [space, pages, store] = await Promise.all([loadSpace(id), loadSpacePages(id), cookies()])
  const width = sidebarWidth(store.get(SIDEBAR_COOKIE)?.value)
  return (
    <div className="with-sidebar" style={width ? ({ '--sidebar-w': width } as CSSProperties) : undefined}>
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
