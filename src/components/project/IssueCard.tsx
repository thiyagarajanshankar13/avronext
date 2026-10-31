'use client'
import type { DeckBoard, DeckCard } from '@/lib/nextcloud/deck'
import { dueState, fmtShort } from '@/lib/format'
import { issueKey } from '@/lib/keys'
import { AvatarStack } from '../Avatar'
import { Icon } from '../Icon'
import { labelStyle } from './status'

export function DueBadge({ duedate, done }: { duedate: string; done?: boolean }) {
  const state = dueState(duedate, done)
  return (
    <span className={`due-badge due-${state}`} title={`Due ${new Date(duedate).toLocaleString()}`}>
      <Icon name="calendar" size={12} /> {fmtShort(duedate)}
    </span>
  )
}

export function IssueCard({
  board,
  card,
  isDone,
  onOpen,
  dragging,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  board: DeckBoard
  card: DeckCard
  isDone: boolean
  onOpen: () => void
  dragging?: boolean
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}) {
  const done = isDone || Boolean(card.done)
  return (
    <div
      className={`issue-card${dragging ? ' is-dragging' : ''}`}
      data-card-id={card.id}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      role="button"
      tabIndex={0}
    >
      <div className="issue-card-title">{card.title}</div>
      {card.labels.length > 0 && (
        <div className="issue-card-labels">
          {card.labels.map((l) => (
            <span key={l.id} className="label-chip label-chip-sm" style={labelStyle(l.color)}>
              {l.title}
            </span>
          ))}
        </div>
      )}
      <div className="issue-card-foot">
        <span className={`issue-key${done ? ' is-done' : ''}`}>
          <Icon name="task" className="type-icon" size={14} />
          {issueKey(board.title, card.id)}
        </span>
        {card.duedate && <DueBadge duedate={card.duedate} done={done} />}
        {(card.attachmentCount ?? 0) > 0 && (
          <span className="meta-count" title={`${card.attachmentCount} attachment${card.attachmentCount === 1 ? '' : 's'}`}>
            <Icon name="paperclip" size={12} /> {card.attachmentCount}
          </span>
        )}
        {card.commentsCount > 0 && (
          <span className="meta-count" title={`${card.commentsCount} comments`}>
            <Icon name="comment" size={12} /> {card.commentsCount}
          </span>
        )}
        <span className="spacer" />
        <AvatarStack users={card.assignedUsers.map((a) => a.participant)} size={22} max={2} />
      </div>
    </div>
  )
}
