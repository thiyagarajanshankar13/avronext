import Link from 'next/link'
import { AppMissing } from '@/components/AppMissing'
import { Avatar } from '@/components/Avatar'
import { CreateButton } from '@/components/CreateButton'
import { fmtShort } from '@/lib/format'
import { projectKey } from '@/lib/keys'
import { loadOrSignOut } from '@/lib/nextcloud/http'
import { requireSession } from '@/lib/session'
import { loadBoards } from '@/lib/workspace'

export const metadata = { title: 'Projects' }

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSession()
  const { boards, error: deckError } = await loadOrSignOut(() => loadBoards(session))
  const q = ((await searchParams).q ?? '').trim().toLowerCase()
  const shown = q ? boards.filter((b) => b.title.toLowerCase().includes(q)) : boards
  return (
    <main className="main main-wide">
      <div className="page-header">
        <div className="page-title-row">
          <h1>Projects</h1>
          {!deckError && <CreateButton kind="project" label="Create project" />}
        </div>
        {!deckError && (
          <form className="filter-bar">
            <label className="search-input">
              <input name="q" defaultValue={q} placeholder="Search projects" aria-label="Search projects" />
            </label>
          </form>
        )}
      </div>
      {deckError ? (
        <AppMissing app="Deck" detail={deckError} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="col-key">Key</th>
                <th className="hide-sm">Lead</th>
                <th className="hide-md">People</th>
                <th className="col-date hide-sm">Updated</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link prefetch={false} href={`/projects/${b.id}`} className="project-cell">
                      <span className="project-avatar project-avatar-sm" style={{ background: `#${b.color}` }}>
                        {projectKey(b.title).slice(0, 2)}
                      </span>
                      {b.title}
                    </Link>
                  </td>
                  <td className="col-key">{projectKey(b.title)}</td>
                  <td className="hide-sm">
                    <span className="person">
                      <Avatar uid={b.owner.uid} name={b.owner.displayname} size={24} /> {b.owner.displayname}
                    </span>
                  </td>
                  <td className="hide-md muted">{b.users?.length ?? 1}</td>
                  <td className="col-date hide-sm muted">{b.lastModified ? fmtShort(b.lastModified) : '—'}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    {q ? 'No projects match.' : 'No projects yet. Create one to get started.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
