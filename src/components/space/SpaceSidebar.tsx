'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPage } from '@/app/(app)/spaces/actions'
import { ancestors, buildTree, type PageLite, type TreeNode } from '@/lib/pageTree'
import { useGoFresh } from '@/lib/useGoFresh'
import { Icon } from '../Icon'

export function SpaceSidebar({
  space,
  pages,
  canEdit,
  canManage,
  nextcloudHref,
}: {
  space: { id: number; name: string; emoji: string | null }
  pages: PageLite[]
  canEdit: boolean
  /** Moderator or admin of the space: shows "Space settings". */
  canManage: boolean
  nextcloudHref: string
}) {
  const goFresh = useGoFresh()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const root = useMemo(() => buildTree(pages), [pages])
  const onSettings = pathname.endsWith('/settings')
  const activeId = Number(pathname.match(/\/pages\/(\d+)/)?.[1]) || (onSettings ? undefined : root?.id)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())

  // Keep the active page's ancestors expanded.
  useEffect(() => {
    if (!activeId) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const a of ancestors(pages, activeId)) next.add(a.id)
      return next
    })
  }, [activeId, pages])

  const newPage = (parentId: number | null) =>
    start(async () => {
      const r = await createPage(space.id, parentId, 'Untitled page')
      if (!r.ok) return alert(r.error)
      if (parentId) setExpanded((e) => new Set(e).add(parentId))
      goFresh(`/spaces/${space.id}/pages/${r.data.id}/edit`)
    })

  const renderNode = (node: TreeNode, depth: number) => {
    const isOpen = expanded.has(node.id)
    const active = node.id === activeId
    return (
      <li key={node.id}>
        <div className={`tree-row${active ? ' is-active' : ''}`} style={{ paddingLeft: 4 + depth * 14 }}>
          {node.children.length ? (
            <button
              className="tree-toggle"
              aria-label={isOpen ? 'Collapse' : 'Expand'}
              aria-expanded={isOpen}
              onClick={() =>
                setExpanded((e) => {
                  const n = new Set(e)
                  if (n.has(node.id)) n.delete(node.id)
                  else n.add(node.id)
                  return n
                })
              }
            >
              <Icon name="chevronRight" size={14} className={isOpen ? 'rot-90' : ''} />
            </button>
          ) : (
            <span className="tree-toggle tree-leaf">{node.emoji ? null : <Icon name="page" size={13} />}</span>
          )}
          <Link prefetch={false} href={`/spaces/${space.id}/pages/${node.id}`} className="tree-link" onClick={() => setOpen(false)}>
            {node.emoji && <span className="tree-emoji">{node.emoji}</span>}
            <span className="tree-title">{node.title}</span>
          </Link>
          {canEdit && (
            <button className="tree-add" title="Create child page" aria-label={`Create a page under ${node.title}`} disabled={pending} onClick={() => newPage(node.id)}>
              <Icon name="plus" size={14} />
            </button>
          )}
        </div>
        {isOpen && node.children.length > 0 && <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    )
  }

  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`}>
      <button className="sidebar-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="menu" /> {space.name}
      </button>
      <div className="sidebar-inner">
        <div className="sidebar-head">
          <span className="space-avatar">{space.emoji || '📘'}</span>
          <div>
            <div className="sidebar-title">{space.name}</div>
            <div className="sidebar-sub">Space</div>
          </div>
        </div>
        {root && (
          <Link prefetch={false} href={`/spaces/${space.id}`} className={`side-link${activeId === root.id ? ' is-active' : ''}`} onClick={() => setOpen(false)}>
            <Icon name="home" /> Overview
          </Link>
        )}
        {/* Phones: the page tree opens as a sheet from this chip. */}
        <button className="side-link side-pages-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Icon name="page" /> Pages
        </button>
        <a className="side-link" href={nextcloudHref} target="_blank" rel="noopener noreferrer">
          <Icon name="external" /> Open in Collectives
        </a>
        {canManage && (
          <Link prefetch={false} href={`/spaces/${space.id}/settings`} className={`side-link${onSettings ? ' is-active' : ''}`} onClick={() => setOpen(false)}>
            <Icon name="settings" /> Space settings
          </Link>
        )}
        {open && <div className="side-sheet-backdrop" onClick={() => setOpen(false)} />}
        <div className="side-group-label side-group-row side-pages-head">
          <span>Content</span>
          {canEdit && (
            <button className="tree-add is-visible" title="Create page" aria-label="Create page" disabled={pending} onClick={() => newPage(null)}>
              <Icon name="plus" size={14} />
            </button>
          )}
        </div>
        <ul className="page-tree">{root ? root.children.map((c) => renderNode(c, 0)) : <li className="muted small">No pages</li>}</ul>
        {root && root.children.length === 0 && <p className="muted small tree-empty">No pages yet.</p>}
      </div>
    </aside>
  )
}
