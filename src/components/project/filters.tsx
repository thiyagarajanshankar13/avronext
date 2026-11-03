'use client'
import { useEffect, useMemo, useState } from 'react'
import type { DeckBoard, DeckCard, DeckStack } from '@/lib/nextcloud/deck'
import { issueKey } from '@/lib/keys'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import { publishBoardLabels, setBoardFilterLabels, useBoardLabelFilter } from './boardFilterContext'
import { labelStyle } from './status'

export type IssueFilter = { text: string; assignees: string[]; labels: number[]; onlyMine: boolean; unassigned: boolean }

type LocalFilter = Omit<IssueFilter, 'labels'>
const NO_FILTER: LocalFilter = { text: '', assignees: [], onlyMine: false, unassigned: false }

export function useIssueFilter(board: DeckBoard, me: string, stacks: DeckStack[]) {
  // Labels live in the shared store (the project sidebar toggles them too); the rest is local.
  const [local, setLocal] = useState<LocalFilter>(NO_FILTER)
  const { selected } = useBoardLabelFilter(board.id)
  const filter = useMemo<IssueFilter>(() => ({ ...local, labels: selected }), [local, selected])
  const setFilter = (next: IssueFilter) => {
    const { labels, ...rest } = next
    setLocal(rest)
    if (labels !== selected) setBoardFilterLabels(board.id, labels)
  }
  const matches = useMemo(() => {
    const text = filter.text.trim().toLowerCase()
    return (card: DeckCard) => {
      const uids = card.assignedUsers.map((a) => a.participant.uid)
      if (filter.onlyMine && !uids.includes(me)) return false
      if (filter.unassigned && uids.length) return false
      if (filter.assignees.length && !filter.assignees.some((a) => uids.includes(a))) return false
      if (filter.labels.length && !filter.labels.some((l) => card.labels.some((cl) => cl.id === l))) return false
      if (text) {
        const hay = `${card.title} ${card.description ?? ''} ${issueKey(board.title, card.id)}`.toLowerCase()
        if (!hay.includes(text)) return false
      }
      return true
    }
  }, [filter, me, board.title])
  // The sidebar lists the board's labels with how many issues carry each.
  useEffect(() => {
    const counts = new Map<number, number>()
    for (const st of stacks) for (const c of st.cards ?? []) for (const l of c.labels) counts.set(l.id, (counts.get(l.id) ?? 0) + 1)
    publishBoardLabels(
      board.id,
      board.labels.map((l) => ({ id: l.id, title: l.title, color: l.color, count: counts.get(l.id) ?? 0 })),
    )
  }, [board.id, board.labels, stacks])
  useEffect(() => () => publishBoardLabels(board.id, null), [board.id])
  // How many issues each person has: the assignee filter shows the busiest first.
  const assigneeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const st of stacks) for (const c of st.cards ?? []) for (const a of c.assignedUsers) m.set(a.participant.uid, (m.get(a.participant.uid) ?? 0) + 1)
    return m
  }, [stacks])
  const active = Boolean(filter.text || filter.assignees.length || filter.labels.length || filter.onlyMine || filter.unassigned)
  return { filter, setFilter, matches, active, assigneeCounts, clear: () => setFilter({ ...NO_FILTER, labels: [] }) }
}

export function FilterBar({ board, state }: { board: DeckBoard; state: ReturnType<typeof useIssueFilter> }) {
  const { filter, setFilter, active, clear } = state
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  return (
    <div className="filter-bar">
      <label className="search-input">
        <Icon name="search" />
        <input value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} placeholder="Search this board" aria-label="Search this board" />
      </label>
      <AssigneeFilter users={board.users} counts={state.assigneeCounts} selected={filter.assignees} onToggle={(uid) => setFilter({ ...filter, assignees: toggle(filter.assignees, uid) })} />
      {board.labels.length > 0 && (
        <Menu
          label="Filter by label"
          trigger={
            <span className={`btn btn-default${filter.labels.length ? ' is-selected' : ''}`}>
              Label{filter.labels.length ? ` (${filter.labels.length})` : ''} <Icon name="chevronDown" />
            </span>
          }
        >
          {() =>
            board.labels.map((l) => (
              <label key={l.id} className="menu-item menu-check">
                <input type="checkbox" checked={filter.labels.includes(l.id)} onChange={() => setFilter({ ...filter, labels: toggle(filter.labels, l.id) })} />
                <span className="label-chip" style={labelStyle(l.color)}>
                  {l.title}
                </span>
              </label>
            ))
          }
        </Menu>
      )}
      <button className={`btn btn-default${filter.onlyMine ? ' is-selected' : ''}`} onClick={() => setFilter({ ...filter, onlyMine: !filter.onlyMine })} aria-pressed={filter.onlyMine}>
        Only my issues
      </button>
      <button className={`btn btn-default${filter.unassigned ? ' is-selected' : ''}`} onClick={() => setFilter({ ...filter, unassigned: !filter.unassigned })} aria-pressed={filter.unassigned}>
        Unassigned
      </button>
      {active && (
        <button className="btn btn-subtle" onClick={clear}>
          Clear filters
        </button>
      )}
    </div>
  )
}

const SHOWN = 5

/**
 * Assignee filter: the first few people as overlapping avatars and a "+N" menu
 * listing everyone by name.
 */
function AssigneeFilter({
  users: boardUsers,
  counts,
  selected,
  onToggle,
}: {
  users: DeckBoard['users']
  counts: Map<string, number>
  selected: string[]
  onToggle: (uid: string) => void
}) {
  if (!boardUsers.length) return null
  // Most issues first, then by name; people picked from the "+N" menu join the row so the selection stays visible.
  const users = [...boardUsers].sort((a, b) => (counts.get(b.uid) ?? 0) - (counts.get(a.uid) ?? 0) || a.displayname.localeCompare(b.displayname))
  const first = users.length <= SHOWN + 1 ? users : users.slice(0, SHOWN)
  const shown = [...first, ...users.filter((u) => selected.includes(u.uid) && !first.includes(u))]
  const more = users.length - shown.length
  return (
    <div className="avatar-filter" role="group" aria-label="Filter by assignee">
      {shown.map((u) => (
        <button
          key={u.uid}
          className={`avatar-toggle${selected.includes(u.uid) ? ' is-on' : ''}`}
          onClick={() => onToggle(u.uid)}
          title={u.displayname}
          aria-label={`Filter by ${u.displayname}`}
          aria-pressed={selected.includes(u.uid)}
        >
          <Avatar uid={u.uid} name={u.displayname} size={32} title={u.displayname} />
        </button>
      ))}
      {more > 0 && (
        <Menu
          className="avatar-more-menu"
          label={`${more} more people`}
          trigger={<span className="avatar avatar-initials avatar-more">+{more}</span>}
        >
          {() => (
            <>
              <div className="menu-heading">Assignee</div>
              {users.map((u) => (
                <label key={u.uid} className="menu-item menu-check">
                  <input type="checkbox" checked={selected.includes(u.uid)} onChange={() => onToggle(u.uid)} />
                  <Avatar uid={u.uid} name={u.displayname} size={24} />
                  <span>{u.displayname}</span>
                </label>
              ))}
            </>
          )}
        </Menu>
      )}
    </div>
  )
}
