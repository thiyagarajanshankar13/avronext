import Link from 'next/link'
import { issueKey } from '@/lib/keys'
import type { CardRow } from '@/lib/overview'
import { Icon } from './Icon'
import { Lozenge } from './Lozenge'
import { DueBadge } from './project/IssueCard'

export function IssueRow({ row }: { row: CardRow }) {
  const { card, board } = row
  const done = Boolean(card.done) || (row.stackIndex === row.stackCount - 1 && row.stackCount > 1)
  const tone = card.done ? 'success' : row.stackIndex === 0 ? 'default' : row.stackIndex === row.stackCount - 1 ? 'success' : 'inprogress'
  return (
    <li>
      <Link prefetch={false} href={`/projects/${board.id}?issue=${card.id}`} className="work-row">
        <Icon name="task" className="type-icon" size={16} />
        <span className="work-row-main">
          <span className="work-row-title">{card.title}</span>
          <span className="work-row-sub">
            <span className={done ? 'is-done' : ''}>{issueKey(board.title, card.id)}</span> · {board.title}
          </span>
        </span>
        {card.duedate && <DueBadge duedate={card.duedate} done={done} />}
        <Lozenge tone={tone}>{card.done ? 'Done' : row.stackTitle}</Lozenge>
      </Link>
    </li>
  )
}
