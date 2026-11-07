'use client'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import { CreateIssueModal } from './create/CreateIssueModal'
import { CreatePageModal } from './create/CreatePageModal'
import { CreateProjectModal } from './create/CreateProjectModal'
import { CreateSpaceModal } from './create/CreateSpaceModal'
import { Icon, type IconName } from './Icon'
import { InstallHelp, useInstall } from './InstallApp'
import { Logo } from './Logo'
import { Menu } from './Menu'
import { startNavProgress } from './NavProgress'
import { ThemeSwitch } from './ThemeSwitch'
import { FAB_EVENT } from '@/lib/fab'
import { mailUnreadCount } from '@/app/(app)/mail/actions'

export type NavProject = { id: number; title: string; color: string }
export type NavSpace = { id: number; name: string; emoji: string | null }

type Creating = null | 'issue' | 'page' | 'project' | 'space'


const TABS: [href: string, label: string, icon: IconName, match: (p: string) => boolean][] = [
  ['/', 'Home', 'home', (p) => p === '/'],
  ['/projects', 'Projects', 'board', (p) => p.startsWith('/projects')],
  ['/spaces', 'Spaces', 'bookFilled', (p) => p.startsWith('/spaces')],
  ['/files', 'Files', 'folder', (p) => p.startsWith('/files')],
  ['/notes', 'Notes', 'bulbFilled', (p) => p.startsWith('/notes')],
]
const MAIL_TAB: (typeof TABS)[number] = ['/mail', 'Mail', 'mail', (p) => p.startsWith('/mail')]

/** Mail's unread badge listens for this (MailApp sends it when counts change). */
export const MAIL_UNREAD_EVENT = 'avronext:mail-unread'

/** Phone top bar: where we are, and the way back up. */
function mobileHeading(pathname: string, projects: NavProject[], spaces: NavSpace[]): { title: string; back: string | null } {
  const seg = pathname.split('/').filter(Boolean)
  const project = projects.find((p) => p.id === Number(seg[1]))
  const space = spaces.find((s) => s.id === Number(seg[1]))
  if (!seg.length) return { title: 'Home', back: null }
  switch (seg[0]) {
    case 'projects':
      if (!seg[1]) return { title: 'Projects', back: null }
      return { title: seg[2] === 'settings' ? 'Project settings' : (project?.title ?? 'Project'), back: seg[2] === 'settings' ? `/projects/${seg[1]}` : '/projects' }
    case 'spaces':
      if (!seg[1]) return { title: 'Spaces', back: null }
      return { title: space?.name ?? 'Space', back: seg.length > 2 ? `/spaces/${seg[1]}` : '/spaces' }
    case 'files': {
      if (!seg[1]) return { title: 'Files', back: null }
      const name = decodeURIComponent(seg[seg.length - 1])
      return { title: name, back: seg.length > 2 ? '/' + seg.slice(0, -1).join('/') : '/files' }
    }
    case 'notes':
      return { title: 'Notes', back: null }
    case 'mail':
      return { title: 'Mail', back: null }
    case 'search':
      return { title: 'Search', back: '/' }
    case 'admin':
      return { title: 'Administration', back: '/' }
    case 'share':
      return { title: 'Save to AvroNext', back: '/' }
    default:
      return { title: 'AvroNext', back: '/' }
  }
}

export function TopNav({
  user,
  nextcloudUrl,
  canAdminister,
  mail = false,
  projects,
  spaces,
}: {
  user: { uid: string; name: string }
  nextcloudUrl: string
  /** Nextcloud admin or group admin: shows "Administration". */
  canAdminister: boolean
  /** Mail is set up on this server (MAIL_IMAP_HOST…): shows the Mail tab. */
  mail?: boolean
  projects: NavProject[]
  spaces: NavSpace[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const [creating, setCreating] = useState<Creating>(null)
  const [q, setQ] = useState(pathname === '/search' ? (params.get('q') ?? '') : '')
  const install = useInstall()
  const [installHelp, setInstallHelp] = useState(false)

  // Create actions redirect to what they made; close the dialog when we get there.
  const location = `${pathname}?${params.toString()}`
  useEffect(() => setCreating(null), [location])
  // App-icon shortcut "New issue" (/?create=issue).
  useEffect(() => {
    if (params.get('create') === 'issue') setCreating('issue')
  }, [params])

  // Phones scroll the tabs sideways: keep the current one in view.
  useEffect(() => {
    document.querySelector('.topnav-links .is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  const currentProject = Number(pathname.match(/^\/projects\/(\d+)/)?.[1]) || undefined
  const currentSpace = Number(pathname.match(/^\/spaces\/(\d+)/)?.[1]) || undefined
  const currentPage = Number(pathname.match(/^\/spaces\/\d+\/pages\/(\d+)/)?.[1]) || undefined

  const heading = mobileHeading(pathname, projects, spaces)

  // Unread mail in the nav: polled every minute (and on tab focus); Mail itself reports changes at once.
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (!mail) return
    const load = () => mailUnreadCount().then((r) => r.ok && setUnread(r.data))
    load()
    const t = setInterval(load, 60_000)
    const onFocus = () => document.visibilityState === 'visible' && load()
    const onCount = (e: Event) => setUnread((e as CustomEvent<number>).detail)
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener(MAIL_UNREAD_EVENT, onCount)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener(MAIL_UNREAD_EVENT, onCount)
    }
  }, [mail])
  // What the phone's + button does here (null = no button).
  const fab: { label: string; run: () => void } | null = (() => {
    const emit = (target: string) => () => window.dispatchEvent(new CustomEvent(FAB_EVENT, { detail: target }))
    if (pathname.startsWith('/files')) return { label: 'Add files', run: emit('files') }
    if (pathname.startsWith('/notes')) return { label: 'New note', run: emit('notes') }
    if (pathname.startsWith('/mail')) return { label: 'New message', run: emit('mail') }
    if (/^\/spaces\/\d+/.test(pathname)) return { label: 'New page', run: () => setCreating('page') }
    if (pathname === '/spaces') return { label: 'New space', run: () => setCreating('space') }
    if (pathname === '/' || pathname.startsWith('/projects')) return { label: 'New issue', run: () => setCreating('issue') }
    return null
  })()

  const tab = (href: string, label: string, active: boolean, extra = '') => (
    <Link prefetch={false} href={href} className={`topnav-link${active ? ' is-active' : ''}${extra}`}>
      {label}
    </Link>
  )

  return (
    <header className="topnav">
      <div className="topnav-mobile">
        {heading.back ? (
          <Link prefetch={false} href={heading.back} className="icon-btn topnav-back" aria-label="Back">
            <Icon name="arrowBack" size={22} />
          </Link>
        ) : (
          <Link prefetch={false} href="/" className="topnav-mobile-logo" aria-label="AvroNext home">
            <Logo size={28} />
          </Link>
        )}
        <span className="topnav-mobile-title">{heading.title}</span>
      </div>
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
          {mail && (
            <Link prefetch={false} href="/mail" className={`topnav-link${pathname.startsWith('/mail') ? ' is-active' : ''}`}>
              Mail
              {unread > 0 && <span className="nav-badge" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>}
            </Link>
          )}
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
        <Link prefetch={false} href="/search" className="icon-btn show-sm nav-search-btn" aria-label="Search">
          <Icon name="search" size={26} />
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
              {!install.standalone && (
                <button className="menu-item" onClick={() => (install.canPrompt ? install.prompt() : setInstallHelp(true))}>
                  <Icon name="install" /> Install app
                </button>
              )}
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
      {installHelp && <InstallHelp ios={install.ios} onClose={() => setInstallHelp(false)} />}

      {/* Phones: bottom tab bar and the + button (hidden on larger screens). */}
      {fab && (
        <button className="fab" aria-label={fab.label} title={fab.label} onClick={fab.run}>
          <Icon name="plus" size={26} />
        </button>
      )}
      <nav className="bottomnav" aria-label="Sections">
        {(mail ? [...TABS.slice(0, 4), MAIL_TAB, TABS[4]] : TABS).map(([href, label, icon, match]) => {
          const active = match(pathname)
          return (
            <Link key={href} prefetch={false} href={href} className={`bottomnav-tab${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
              <span className="bottomnav-pill">
                <Icon name={icon} size={22} />
                {href === '/mail' && unread > 0 && <span className="nav-badge nav-badge-dot" aria-label={`${unread} unread`} />}
              </span>
              <span className="bottomnav-label">{label}</span>
            </Link>
          )
        })}
      </nav>
      {creating === 'space' && <CreateSpaceModal onClose={() => setCreating(null)} />}
    </header>
  )
}
