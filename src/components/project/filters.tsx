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
  const active = Boolean(filter.text || filter.assignees.length || filter.labels.length || filter.onlyMine || filter.unassigned)
  return { filter, setFilter, matches, active, clear: () => setFilter({ ...NO_FILTER, labels: [] }) }
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
      <div className="avatar-filter" role="group" aria-label="Filter by assignee">
        {board.users.slice(0, 8).map((u) => (
          <button
            key={u.uid}
            className={`avatar-toggle${filter.assignees.includes(u.uid) ? ' is-on' : ''}`}
            onClick={() => setFilter({ ...filter, assignees: toggle(filter.assignees, u.uid) })}
            title={u.displayname}
            aria-pressed={filter.assignees.includes(u.uid)}
          >
            <Avatar uid={u.uid} name={u.displayname} size={32} />
          </button>
        ))}
      </div>
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
