import { notFound } from 'next/navigation'
import { PageScreen } from '@/components/space/PageScreen'
import { loadSpacePages } from '@/lib/loaders'

export async function generateMetadata({ params }: { params: Promise<{ collectiveId: string; pageId: string }> }) {
  const { collectiveId, pageId } = await params
  const pages = await loadSpacePages(Number(collectiveId))
  const page = pages.find((p) => p.id === Number(pageId))
  return { title: page ? (page.parentId === 0 ? 'Overview' : page.title) : 'Page' }
}

export default async function PageView({ params }: { params: Promise<{ collectiveId: string; pageId: string }> }) {
  const { collectiveId, pageId } = await params
  const pid = Number(pageId)
  if (!Number.isInteger(pid) || pid <= 0) notFound()
  return <PageScreen cid={Number(collectiveId)} pageId={pid} edit={false} />
}
