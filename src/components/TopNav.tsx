'use client'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import { CreateIssueModal } from './create/CreateIssueModal'
import { CreatePageModal } from './create/CreatePageModal'
import { CreateProjectModal } from './create/CreateProjectModal'
import { CreateSpaceModal } from './create/CreateSpaceModal'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { Menu } from './Menu'
import { startNavProgress } from './NavProgress'
import { ThemeSwitch } from './ThemeSwitch'

export type NavProject = { id: number; title: string; color: string }
export type NavSpace = { id: number; name: string; emoji: string | null }

type Creating = null | 'issue' | 'page' | 'project' | 'space'

export function TopNav({
  user,
  nextcloudUrl,
  canAdminister,
  projects,
  spaces,
}: {
  user: { uid: string; name: string }
  nextcloudUrl: string
  /** Nextcloud admin or group admin: shows "Administration". */
  canAdminister: boolean
  projects: NavProject[]
  spaces: NavSpace[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const [creating, setCreating] = useState<Creating>(null)
  const [q, setQ] = useState(pathname === '/search' ? (params.get('q') ?? '') : '')

  // Create actions redirect to what they made; close the dialog when we get there.
  const location = `${pathname}?${params.toString()}`
  useEffect(() => setCreating(null), [location])

  // Phones scroll the tabs sideways: keep the current one in view.
  useEffect(() => {
    document.querySelector('.topnav-links .is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  const currentProject = Number(pathname.match(/^\/projects\/(\d+)/)?.[1]) || undefined
  const currentSpace = Number(pathname.match(/^\/spaces\/(\d+)/)?.[1]) || undefined
  const currentPage = Number(pathname.match(/^\/spaces\/\d+\/pages\/(\d+)/)?.[1]) || undefined

  const tab = (href: string, label: string, active: boolean, extra = '') => (
    <Link prefetch={false} href={href} className={`topnav-link${active ? ' is-active' : ''}${extra}`}>
      {label}
    </Link>
  )

  return (
    <header className="topnav">
      <div className="topnav-left">
        <Link prefetch={false} href="/" className="topnav-logo" aria-label="AvroNext home">
          <Logo />
        </Link>
        <nav className="topnav-links">
          {/* Phones: the logo is the way home, leaving room for the other tabs. */}
          {tab('/', 'Your work', pathname === '/', ' topnav-home')}
          {tab('/projects', 'Projects', pathname.startsWith('/projects'))}
          {tab('/spaces', 'Spaces', pathname.startsWith('/spaces'))}
          {tab('/files', 'Files', pathname.startsWith('/files'))}
          {tab('/notes', 'Notes', pathname.startsWith('/notes'))}
        </nav>
        <Menu
          className="topnav-create"
          label="Create"
          trigger={
            <span className="btn btn-primary">
              <Icon name="plus" />
              <span className="hide-sm">Create</span>
            </span>
          }
        >
          {(close) => (
            <>
              <div className="menu-heading">Create</div>
              {(
                [
                  ['issue', 'task', 'Issue', 'A task on a project board'],
                  ['page', 'page', 'Page', 'A page in a space'],
                  ['project', 'board', 'Project', 'A new board (Nextcloud Deck)'],
                  ['space', 'book', 'Space', 'A new wiki (Nextcloud Collectives)'],
                ] as const
              ).map(([key, icon, label, desc]) => (
                <button
                  key={key}
                  className="menu-item menu-item-rich"
                  onClick={() => {
                    close()
                    setCreating(key)
                  }}
                >
                  <span className={`menu-icon menu-icon-${key}`}>
                    <Icon name={icon} />
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>{desc}</small>
                  </span>
                </button>
              ))}
            </>
          )}
        </Menu>
      </div>
      <div className="topnav-right">
        <form
          className="topnav-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            if (!q.trim()) return
            startNavProgress()
            router.push(`/search?q=${encodeURIComponent(q.trim())}`)
          }}
        >
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search issues and pages" />
        </form>
        <Link prefetch={false} href="/search" className="icon-btn show-sm" aria-label="Search">
          <Icon name="search" size={20} />
        </Link>
        <Menu align="right" label="Your profile" trigger={<Avatar uid={user.uid} name={user.name} size={28} />}>
          {() => (
            <>
              <div className="menu-profile">
                <Avatar uid={user.uid} name={user.name} size={40} />
                <div>
                  <strong>{user.name}</strong>
                  <small>{user.uid}</small>
                </div>
              </div>
              <div className="menu-sep" />
              <ThemeSwitch />
              <div className="menu-sep" />
              {canAdminister && (
                <Link prefetch={false} className="menu-item" href="/admin/users">
                  <Icon name="shield" /> Administration
                </Link>
              )}
              <a className="menu-item" href={nextcloudUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="external" /> Open Nextcloud
              </a>
              <form action="/logout" method="post">
                <button className="menu-item">
                  <Icon name="logout" /> Log out
                </button>
              </form>
            </>
          )}
        </Menu>
      </div>

      {creating === 'issue' && <CreateIssueModal projects={projects} defaultProject={currentProject} onClose={() => setCreating(null)} />}
      {creating === 'page' && (
        <CreatePageModal spaces={spaces} defaultSpace={currentSpace} parentId={currentPage} onClose={() => setCreating(null)} />
      )}
      {creating === 'project' && <CreateProjectModal onClose={() => setCreating(null)} />}
      {creating === 'space' && <CreateSpaceModal onClose={() => setCreating(null)} />}
    </header>
  )
}
