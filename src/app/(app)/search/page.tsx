import Link from 'next/link'
import { Suspense } from 'react'
import { IssueRow } from '@/components/IssueRow'
import { RowsSkeleton } from '@/components/Skeleton'
import { fmtRelative } from '@/lib/format'
import { issueKey } from '@/lib/keys'
import { searchPages } from '@/lib/nextcloud/collectives'
import { loadOrSignOut } from '@/lib/nextcloud/http'
import { allCards, allPages } from '@/lib/overview'
import { requireSession, type Session } from '@/lib/session'
import { loadWorkspace } from '@/lib/workspace'

export const metadata = { title: 'Search' }

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim()
  const session = await requireSession()
  return (
    <main className="main main-wide">
      <div className="page-header">
        <h1>Search</h1>
        <form className="filter-bar" action="/search">
          <label className="search-input search-input-lg">
            <input name="q" defaultValue={q} placeholder="Search issues and pages" autoFocus aria-label="Search" />
          </label>
          <button className="btn btn-primary">Search</button>
        </form>
      </div>
      {q && (
        <Suspense
          key={q}
          fallback={
            <div className="home-grid">
              <section className="home-section panel">
                <RowsSkeleton rows={4} />
              </section>
              <section className="home-section panel">
                <RowsSkeleton rows={4} />
              </section>
            </div>
          }
        >
          <Results session={session} q={q} />
        </Suspense>
      )}
    </main>
  )
}

async function Results({ session, q }: { session: Session; q: string }) {
  const needle = q.toLowerCase()

  let issues: Awaited<ReturnType<typeof allCards>> = []
  let pages: Awaited<ReturnType<typeof allPages>> = []
  if (q) {
    const ws = await loadOrSignOut(() => loadWorkspace(session))
    const [cards, allP, contentHits] = await loadOrSignOut(() =>
      Promise.all([
        allCards(session, ws),
        allPages(session, ws),
        // Full-text search inside page bodies (Collectives' own index); ignore spaces where it fails.
        Promise.all(
          ws.collectives.map((c) =>
            searchPages(session, c.id, q)
              .then((ps) => ps.map((p) => p.id))
              .catch(() => [] as number[]),
          ),
        ),
      ]),
    )
    const contentIds = new Set(contentHits.flat())
    issues = cards.filter(
      (r) =>
        r.card.title.toLowerCase().includes(needle) ||
        (r.card.description ?? '').toLowerCase().includes(needle) ||
        issueKey(r.board.title, r.card.id).toLowerCase() === needle,
    )
    pages = allP.filter((r) => r.page.title.toLowerCase().includes(needle) || contentIds.has(r.page.id))
  }

  return (
    <div className="home-grid">
      <section className="home-section panel">
        <div className="section-head">
          <h2>Issues</h2>
          <span className="count-pill">{issues.length}</span>
        </div>
        {issues.length ? (
          <ul className="work-list">
            {issues.slice(0, 50).map((r) => (
              <IssueRow key={r.card.id} row={r} />
            ))}
          </ul>
        ) : (
          <p className="muted small">No issues match “{q}”.</p>
        )}
      </section>
      <section className="home-section panel">
        <div className="section-head">
          <h2>Pages</h2>
          <span className="count-pill">{pages.length}</span>
        </div>
        {pages.length ? (
          <ul className="work-list">
            {pages.slice(0, 50).map(({ page, spaceId, spaceName, spaceEmoji }) => (
              <li key={`${spaceId}-${page.id}`}>
                <Link prefetch={false} href={`/spaces/${spaceId}/pages/${page.id}`} className="work-row">
                  <span className="work-emoji">{page.emoji || (page.parentId === 0 ? spaceEmoji || '📘' : '📄')}</span>
                  <span className="work-row-main">
                    <span className="work-row-title">{page.parentId === 0 ? `${spaceName} overview` : page.title}</span>
                    <span className="work-row-sub">{spaceName}</span>
                  </span>
                  <span className="muted small nowrap">{fmtRelative(page.timestamp)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No pages match “{q}”.</p>
        )}
      </section>
    </div>
  )
}
