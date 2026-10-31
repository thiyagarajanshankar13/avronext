import { PageScreen } from '@/components/space/PageScreen'

/** The space's landing page, rendered in place (no redirect, so no second render). */
export default async function SpaceHome({ params }: { params: Promise<{ collectiveId: string }> }) {
  return <PageScreen cid={Number((await params).collectiveId)} pageId={null} edit={false} />
}
