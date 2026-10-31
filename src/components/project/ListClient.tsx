'use client'
import { useMemo, useState } from 'react'
import { fmtShort } from '@/lib/format'
import { issueKey, projectKey } from '@/lib/keys'
import type { DeckBoard, DeckCard, DeckStack } from '@/lib/nextcloud/deck'
import { AvatarStack } from '../Avatar'
import { Icon } from '../Icon'
import { FilterBar, useIssueFilter } from './filters'
import { DueBadge } from './IssueCard'
import { IssueModal, StatusLozenge } from './IssueModal'
import { labelStyle } from './status'
import { useBoard } from './useBoard'
import { useIssueParam } from './useIssueParam'

type SortKey = 'key' | 'title' | 'status' | 'assignee' | 'due' | 'updated'

export function ListClient({ board, initialStacks, me, nextcloudUrl }: { board: DeckBoard; initialStacks: DeckStack[]; me: string; nextcloudUrl: string }) {
  const api = useBoard(board.id, initialStacks)
  const filter = useIssueFilter(board, me, api.stacks)
  const [issue, setIssue] = useIssueParam()
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'updated', dir: -1 })
  const stackIds = api.stacks.map((s) => s.id)

  const rows = useMemo(() => {
    const all: { card: DeckCard; stack: DeckStack }[] = api.stacks.flatMap((stack) => (stack.cards ?? []).map((card) => ({ card, stack })))
    const value = ({ card, stack }: { card: DeckCard; stack: DeckStack }): string | number => {
      switch (sort.key) {
        case 'key':
          return card.id
        case 'title':
          return card.title.toLowerCase()
        case 'status':
          return stackIds.indexOf(stack.id)
        case 'assignee':
          return card.assignedUsers[0]?.participant.displayname.toLowerCase() ?? '￿'
        case 'due':
          return card.duedate ? new Date(card.duedate).getTime() : Number.MAX_SAFE_INTEGER
        case 'updated':
          return card.lastModified
      }
    }
    return all.filter((r) => filter.matches(r.card)).sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * sort.dir)
  }, [api.stacks, filter.matches, sort, stackIds])

  const th = (key: SortKey, label: string, className = '') => (
    <th className={className}>
      <button className="th-sort" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}>
        {label}
        {sort.key === key && <Icon name="chevronDown" className={sort.dir === 1 ? 'rot-180' : ''} />}
      </button>
    </th>
  )

  return (
    <div className="list-page">
      <div className="page-header">
        <div className="breadcrumbs">
          <a href="/projects">Projects</a>
          <span className="sep">/</span>
          <span>{board.title}</span>
        </div>
        <div className="page-title-row">
          <h1>{projectKey(board.title)} issues</h1>
        </div>
        <FilterBar board={board} state={filter} />
      </div>
      {api.error && (
        <div className="toast" role="alert">
          {api.error}
          <button className="icon-btn" onClick={() => api.setError(null)} aria-label="Dismiss">
            <Icon name="close" />
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table className="data-table issue-table">
          <thead>
            <tr>
              {th('key', 'Key', 'col-key')}
              {th('title', 'Summary')}
              {th('status', 'Status', 'col-status')}
              {th('assignee', 'Assignee', 'col-people')}
              <th className="col-labels hide-md">Labels</th>
              {th('due', 'Due', 'col-date')}
              {th('updated', 'Updated', 'col-date hide-md')}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ card, stack }) => (
              <tr key={card.id} onClick={() => setIssue(card.id)} className="row-link">
                <td className="col-key">
                  <span className="issue-key">
                    <Icon name="task" className="type-icon" size={14} />
                    {issueKey(board.title, card.id)}
                  </span>
                </td>
                <td>
                  <button className="row-title" onClick={() => setIssue(card.id)}>
                    {card.title}
                  </button>
                </td>
                <td className="col-status">
                  <StatusLozenge stackIds={stackIds} stackId={stack.id} title={card.done ? 'Done' : stack.title} done={card.done} />
                </td>
                <td className="col-people">
                  {card.assignedUsers.length ? (
                    <span className="person">
                      <AvatarStack users={card.assignedUsers.map((a) => a.participant)} size={22} max={2} />
                      {card.assignedUsers.length === 1 && <span className="hide-sm">{card.assignedUsers[0].participant.displayname}</span>}
                    </span>
                  ) : (
                    <span className="muted">Unassigned</span>
                  )}
                </td>
                <td className="col-labels hide-md">
                  <span className="chip-list">
                    {card.labels.map((l) => (
                      <span key={l.id} className="label-chip label-chip-sm" style={labelStyle(l.color)}>
                        {l.title}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="col-date">{card.duedate ? <DueBadge duedate={card.duedate} done={Boolean(card.done)} /> : <span className="muted">—</span>}</td>
                <td className="col-date hide-md muted">{fmtShort(card.lastModified)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-cell">
                  {filter.active ? 'No issues match these filters.' : 'No issues yet. Use Create to add one.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="muted small table-foot">
        {rows.length} issue{rows.length === 1 ? '' : 's'}
      </div>
      {issue && <IssueModal board={board} api={api} cardId={issue} me={me} nextcloudUrl={nextcloudUrl} onClose={() => setIssue(null)} />}
    </div>
  )
}
