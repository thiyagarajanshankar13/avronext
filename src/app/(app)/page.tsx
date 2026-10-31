import Link from 'next/link'
import { Suspense } from 'react'
import { IssueRow } from '@/components/IssueRow'
import { RowsSkeleton, Skel } from '@/components/Skeleton'
import { fmtRelative } from '@/lib/format'
import { projectKey } from '@/lib/keys'
import { loadOrSignOut } from '@/lib/nextcloud/http'
import { allCards, allPages, type CardRow } from '@/lib/overview'
import { requireSession, type Session } from '@/lib/session'
import { loadWorkspace } from '@/lib/workspace'

export const metadata = { title: 'Your work' }

/**
 * The heading renders at once; the tiles and each panel stream in as their
 * Nextcloud data arrives (every board's cards / every space's pages).
 */
export default async function HomePage() {
  const session = await requireSession()
  const firstName = session.displayName.split(' ')[0]
  return (
    <main className="main main-wide home">
      <div className="page-header">
        <h1>Your work</h1>
        <p className="muted">Welcome back, {firstName}.</p>
      </div>
      <Suspense fallback={<TilesSkeleton />}>
        <Tiles session={session} />
      </Suspense>
      <div className="home-grid">
        <Panel title="Assigned to me">
          <IssuePanel session={session} kind="mine" />
        </Panel>
        <Panel title="Due this week">
          <IssuePanel session={session} kind="due" />
        </Panel>
        <Panel title="Recently updated pages">
          <RecentPages session={session} />
        </Panel>
        <Panel title="Recently updated issues">
          <IssuePanel session={session} kind="recent" />
        </Panel>
      </div>
    </main>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="home-section panel">
      <Suspense
        fallback={
          <>
            <div className="section-head">
              <h2>{title}</h2>
            </div>
            <RowsSkeleton rows={4} />
          </>
        }
      >
        {children}
      </Suspense>
    </section>
  )
}

function TilesSkeleton() {
  return (
    <section className="home-section">
      <div className="section-head">
        <h2>Recent projects and spaces</h2>
      </div>
      <div className="tile-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tile">
            <Skel w={32} h={32} r={6} />
            <Skel w="70%" />
            <Skel w={50} h={12} />
          </div>
        ))}
      </div>
    </section>
  )
}

async function Tiles({ session }: { session: Session }) {
  const ws = await loadOrSignOut(() => loadWorkspace(session))
  if (!ws.boards.length && !ws.collectives.length) return null
  return (
    <section className="home-section">
      <div className="section-head">
        <h2>Recent projects and spaces</h2>
      </div>
      <div className="tile-row">
        {ws.boards.slice(0, 6).map((b) => (
          <Link prefetch={false} key={`b${b.id}`} href={`/projects/${b.id}`} className="tile" style={{ ['--tile' as string]: `#${b.color}` }}>
            <span className="project-avatar" style={{ background: `#${b.color}` }}>
              {projectKey(b.title).slice(0, 2)}
            </span>
            <span className="tile-name">{b.title}</span>
            <span className="tile-sub">Project</span>
          </Link>
        ))}
        {ws.collectives.slice(0, 6).map((c) => (
          <Link prefetch={false} key={`c${c.id}`} href={`/spaces/${c.id}`} className="tile">
            <span className="space-avatar">{c.emoji || '📘'}</span>
            <span className="tile-name">{c.name}</span>
            <span className="tile-sub">Space</span>
          </Link>
        ))}
      </div>
      {(ws.deckError || ws.collectivesError) && (
        <p className="muted small">
          {ws.deckError && <>Projects unavailable: {ws.deckError} </>}
          {ws.collectivesError && <>Spaces unavailable: {ws.collectivesError}</>}
        </p>
      )}
    </section>
  )
}

const isDoneColumn = (r: CardRow) => r.stackIndex === r.stackCount - 1 && r.stackCount > 1

async function IssuePanel({ session, kind }: { session: Session; kind: 'mine' | 'due' | 'recent' }) {
  const ws = await loadOrSignOut(() => loadWorkspace(session))
  const cards = await loadOrSignOut(() => allCards(session, ws))
  let rows: CardRow[]
  let title: string
  let empty: string
  if (kind === 'mine') {
    title = 'Assigned to me'
    empty = 'Nothing assigned to you that’s still open. Nice.'
    rows = cards
      .filter((r) => r.card.assignedUsers.some((a) => a.participant.uid === session.userId))
      .filter((r) => !r.card.done && !isDoneColumn(r))
      .sort((a, b) => (a.card.duedate ?? '9999').localeCompare(b.card.duedate ?? '9999') || b.card.lastModified - a.card.lastModified)
  } else if (kind === 'due') {
    title = 'Due this week'
    empty = 'No open issues due in the next 7 days.'
    const soon = Date.now() + 7 * 24 * 3600 * 1000
    rows = cards
      .filter((r) => r.card.duedate && !r.card.done && !isDoneColumn(r) && new Date(r.card.duedate).getTime() < soon)
      .sort((a, b) => a.card.duedate!.localeCompare(b.card.duedate!))
  } else {
    title = 'Recently updated issues'
    empty = 'No issues yet.'
    rows = [...cards].sort((a, b) => b.card.lastModified - a.card.lastModified).slice(0, 8)
  }
  return (
    <>
      <div className="section-head">
        <h2>{title}</h2>
        {kind !== 'recent' && <span className="count-pill">{rows.length}</span>}
      </div>
      {rows.length ? (
        <ul className="work-list">
          {rows.slice(0, 12).map((r) => (
            <IssueRow key={r.card.id} row={r} />
          ))}
        </ul>
      ) : (
        <p className="muted small">{empty}</p>
      )}
    </>
  )
}

async function RecentPages({ session }: { session: Session }) {
  const ws = await loadOrSignOut(() => loadWorkspace(session))
  const pages = await loadOrSignOut(() => allPages(session, ws))
  const recent = [...pages].sort((a, b) => b.page.timestamp - a.page.timestamp).slice(0, 10)
  return (
    <>
      <div className="section-head">
        <h2>Recently updated pages</h2>
      </div>
      {recent.length ? (
        <ul className="work-list">
          {recent.map(({ page, spaceId, spaceName, spaceEmoji }) => (
            <li key={`${spaceId}-${page.id}`}>
              <Link prefetch={false} href={`/spaces/${spaceId}/pages/${page.id}`} className="work-row">
                <span className="work-emoji">{page.emoji || (page.parentId === 0 ? spaceEmoji || '📘' : '📄')}</span>
                <span className="work-row-main">
                  <span className="work-row-title">{page.parentId === 0 ? `${spaceName} overview` : page.title}</span>
                  <span className="work-row-sub">
                    {spaceName}
                    {page.lastUserDisplayName ? ` · ${page.lastUserDisplayName}` : ''}
                  </span>
                </span>
                <span className="muted small nowrap">{fmtRelative(page.timestamp)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No pages yet.</p>
      )}
    </>
  )
}
