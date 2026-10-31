'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { projectKey } from '@/lib/keys'
import { Icon, type IconName } from '../Icon'
import { setBoardFilterLabels, useBoardLabelFilter } from './boardFilterContext'
import { labelStyle } from './status'

export function ProjectSidebar({ board, nextcloudUrl, canManage }: { board: { id: number; title: string; color: string }; nextcloudUrl: string; canManage: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const base = `/projects/${board.id}`
  const { labels: all, selected } = useBoardLabelFilter(board.id)
  // Only labels in use (a selected one stays, so it can be turned off).
  const labels = all?.filter((l) => l.count > 0 || selected.includes(l.id)) ?? null
  const toggleLabel = (id: number) => setBoardFilterLabels(board.id, selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const item = (href: string, icon: IconName, label: string) => (
    <Link prefetch={false} href={href} className={`side-link${pathname === href ? ' is-active' : ''}`} onClick={() => setOpen(false)}>
      <Icon name={icon} /> {label}
    </Link>
  )
  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`}>
      <button className="sidebar-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="menu" /> {board.title}
      </button>
      <div className="sidebar-inner">
        <div className="sidebar-head">
          <span className="project-avatar" style={{ background: `#${board.color}` }}>
            {projectKey(board.title).slice(0, 2)}
          </span>
          <div>
            <div className="sidebar-title">{board.title}</div>
            <div className="sidebar-sub">Project · {projectKey(board.title)}</div>
          </div>
        </div>
        <div className="side-group-label">Planning</div>
        {item(base, 'board', 'Board')}
        {item(`${base}/list`, 'list', 'List')}
        {canManage && item(`${base}/settings`, 'settings', 'Project settings')}
        <div className="side-sep" />
        <a className="side-link" href={`${nextcloudUrl}/apps/deck/board/${board.id}`} target="_blank" rel="noopener noreferrer">
          <Icon name="external" /> Open in Deck
        </a>
        {labels && labels.length > 0 && (
          <>
            <div className="side-group-label side-group-row">
              <span>Labels</span>
              {selected.length > 0 && (
                <button className="side-group-action" onClick={() => setBoardFilterLabels(board.id, [])}>
                  Clear
                </button>
              )}
            </div>
            <ul className="side-labels" aria-label="Filter by label">
              {labels.map((l) => {
                const on = selected.includes(l.id)
                return (
                  <li key={l.id}>
                    <button className={`side-label${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggleLabel(l.id)} title={on ? `Stop filtering by ${l.title}` : `Show only ${l.title}`}>
                      <span className="side-label-dot" style={{ background: labelStyle(l.color).background }} />
                      <span className="side-label-title">{l.title}</span>
                      <span className="side-label-count">{l.count}</span>
                      {on && <Icon name="check" size={14} className="side-label-check" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  )
}
