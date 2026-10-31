'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import { UploadsProvider } from './uploads'

const VIEWS: [view: string, label: string, icon: IconName][] = [
  ['', 'My files', 'folder'],
  ['recent', 'Recent', 'clock'],
  ['favorites', 'Favourites', 'star'],
  ['shared', 'Shared with me', 'group'],
  ['sharing', 'Shared by me', 'link'],
]

/** Files layout: the view sidebar, and the upload queue that outlives folder changes. */
export function FilesShell({ children, nextcloudHref }: { children: ReactNode; nextcloudHref: string }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const current = pathname.startsWith('/files') ? (params.get('view') ?? '') : null
  useEffect(() => setOpen(false), [pathname, params])
  const label = VIEWS.find(([v]) => v === current)?.[1] ?? 'Files'
  return (
    <UploadsProvider>
      <div className="with-sidebar">
        <aside className={`sidebar${open ? ' is-open' : ''}`}>
          <button className="sidebar-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Icon name="menu" /> {label}
          </button>
          <div className="sidebar-inner">
            <div className="sidebar-head">
              <span className="space-avatar files-avatar">
                <Icon name="folder" size={18} />
              </span>
              <div>
                <div className="sidebar-title">Files</div>
                <div className="sidebar-sub">Nextcloud Files</div>
              </div>
            </div>
            {VIEWS.map(([view, text, icon]) => (
              <Link
                key={view}
                prefetch={false}
                href={view ? `/files?view=${view}` : '/files'}
                className={`side-link${current === view ? ' is-active' : ''}`}
              >
                <Icon name={icon} /> {text}
              </Link>
            ))}
            <div className="side-sep" />
            <a className="side-link" href={nextcloudHref} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> Open in Nextcloud
            </a>
          </div>
        </aside>
        <main className="main files-main">{children}</main>
      </div>
    </UploadsProvider>
  )
}
