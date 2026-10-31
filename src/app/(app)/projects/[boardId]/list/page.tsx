import { ListClient } from '@/components/project/ListClient'
import { nextcloudPublicUrl } from '@/lib/env'
import { loadBoard, loadBoardStacks } from '@/lib/loaders'
import { requireSession } from '@/lib/session'

export default async function ListPage({ params }: { params: Promise<{ boardId: string }> }) {
  const id = Number((await params).boardId)
  const [session, board, stacks] = await Promise.all([requireSession(), loadBoard(id), loadBoardStacks(id)])
  return <ListClient board={board} initialStacks={stacks} me={session.userId} nextcloudUrl={nextcloudPublicUrl()} />
}
