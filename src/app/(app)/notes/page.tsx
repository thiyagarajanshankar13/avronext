import { NotesApp } from '@/components/notes/NotesApp'
import { requireSession } from '@/lib/session'

export const metadata = { title: 'Notes' }

/** The notes themselves load in the browser (cached copy first, then synced with Nextcloud). */
export default async function NotesPage() {
  const session = await requireSession()
  return <NotesApp uid={session.userId} />
}
