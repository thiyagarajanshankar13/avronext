'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Icon, type IconName } from '../Icon'

export function AdminSidebar({ isAdmin, nextcloudUrl }: { isAdmin: boolean; nextcloudUrl: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const item = (href: string, icon: IconName, label: string) => (
    <Link prefetch={false} href={href} className={`side-link${pathname.startsWith(href) ? ' is-active' : ''}`} onClick={() => setOpen(false)}>
      <Icon name={icon} /> {label}
    </Link>
  )
  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`}>
      <button className="sidebar-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="menu" /> Administration
      </button>
      <div className="sidebar-inner">
        <div className="sidebar-head">
          <span className="project-avatar" style={{ background: 'var(--text-subtle)' }}>
            <Icon name="shield" />
          </span>
          <div>
            <div className="sidebar-title">Administration</div>
            <div className="sidebar-sub">{isAdmin ? 'Nextcloud admin' : 'Group admin'}</div>
          </div>
        </div>
        <div className="side-group-label">People</div>
        {item('/admin/users', 'user', 'Users')}
        {item('/admin/groups', 'group', 'Groups')}
        <div className="side-sep" />
        {isAdmin && (
          <a className="side-link" href={`${nextcloudUrl}/settings/admin`} target="_blank" rel="noopener noreferrer">
            <Icon name="external" /> Nextcloud settings
          </a>
        )}
      </div>
    </aside>
  )
}
