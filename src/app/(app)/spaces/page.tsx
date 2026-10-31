import Link from 'next/link'
import { AppMissing } from '@/components/AppMissing'
import { CreateButton } from '@/components/CreateButton'
import { loadOrSignOut } from '@/lib/nextcloud/http'
import { requireSession } from '@/lib/session'
import { loadCollectives } from '@/lib/workspace'

export const metadata = { title: 'Spaces' }

export default async function SpacesPage() {
  const session = await requireSession()
  const { collectives, error: collectivesError } = await loadOrSignOut(() => loadCollectives(session))
  return (
    <main className="main main-wide">
      <div className="page-header">
        <div className="page-title-row">
          <h1>Spaces</h1>
          {!collectivesError && <CreateButton kind="space" label="Create space" />}
        </div>
      </div>
      {collectivesError ? (
        <AppMissing app="Collectives" detail={collectivesError} />
      ) : collectives.length === 0 ? (
        <div className="empty-state">
          <h2>No spaces yet</h2>
          <p className="muted">Spaces are where your team writes things down: docs, how-tos, meeting notes.</p>
        </div>
      ) : (
        <div className="card-grid">
          {collectives.map((c) => (
            <Link prefetch={false} key={c.id} href={`/spaces/${c.id}`} className="space-card">
              <span className="space-card-icon">{c.emoji || '📘'}</span>
              <span className="space-card-name">{c.name}</span>
              <span className="space-card-meta">{c.canEdit ? 'Can edit' : 'Can view'}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
