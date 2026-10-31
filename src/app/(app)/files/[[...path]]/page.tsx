import { notFound, redirect } from 'next/navigation'
import { FilesBrowser } from '@/components/files/FilesBrowser'
import { loadOrSignOut, NextcloudError } from '@/lib/nextcloud/http'
import { requireSession } from '@/lib/session'
import { FILES_VIEWS, loadFilesView, type FilesView } from '../data'

const TITLES: Record<FilesView, string> = { files: 'My files', recent: 'Recent', favorites: 'Favourites', shared: 'Shared with me', sharing: 'Shared by me' }

function decode(seg: string) {
  try {
    return decodeURIComponent(seg)
  } catch {
    return seg
  }
}

export async function generateMetadata({ params, searchParams }: Props) {
  const view = viewOf((await searchParams).view)
  const segs = (await params).path ?? []
  return { title: view === 'files' && segs.length ? decode(segs[segs.length - 1]) : TITLES[view] }
}

type Props = { params: Promise<{ path?: string[] }>; searchParams: Promise<{ view?: string }> }
const viewOf = (v?: string): FilesView => (FILES_VIEWS.includes(v as FilesView) ? (v as FilesView) : 'files')

export default async function FilesPage({ params, searchParams }: Props) {
  const view = viewOf((await searchParams).view)
  const path = '/' + ((await params).path ?? []).map(decode).join('/')
  const session = await requireSession()
  const data = await loadOrSignOut(() => loadFilesView(session, view, path)).catch((err: unknown) => {
    if (err instanceof NextcloudError && (err.status === 404 || err.status === 400)) notFound()
    throw err
  })
  // The Collectives folder belongs to Spaces.
  if (data.folder && ['collectives-user', 'collective'].includes(data.folder.mountType)) redirect('/spaces')
  return <FilesBrowser key={`${view}:${data.path}`} initial={data} title={TITLES[view]} />
}
