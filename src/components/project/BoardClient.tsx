'use client'
import { Fragment, useEffect, useRef, useState, useTransition } from 'react'
import { createColumn, createIssue, deleteColumn, updateColumn } from '@/app/(app)/projects/actions'
import { projectKey } from '@/lib/keys'
import type { DeckBoard, DeckLabel, DeckStack } from '@/lib/nextcloud/deck'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import { FilterBar, useIssueFilter } from './filters'
import { LabelChips } from './LabelChips'
import { IssueCard } from './IssueCard'
import { IssueModal } from './IssueModal'
import { useBoard } from './useBoard'
import { useIssueParam } from './useIssueParam'

type Drag = { cardId: number; fromStack: number }
type Drop = { stackId: number; index: number }

export function BoardClient({ board, initialStacks, me, nextcloudUrl }: { board: DeckBoard; initialStacks: DeckStack[]; me: string; nextcloudUrl: string }) {
  const api = useBoard(board.id, initialStacks)
  const filter = useIssueFilter(board, me, api.stacks)
  const [issue, setIssue] = useIssueParam()
  const [drag, setDrag] = useState<Drag | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [creatingIn, setCreatingIn] = useState<number | null>(null)
  // Column (swim lane) drag: the dragged column and the slot it would drop into (0…n, before that column).
  const [colDrag, setColDrag] = useState<number | null>(null)
  const [colSlot, setColSlot] = useState<number | null>(null)
  const colFrom = colDrag === null ? -1 : api.stacks.findIndex((s) => s.id === colDrag)
  const onColumnsDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (colDrag === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const cols = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-stack-id]'))
    let slot = cols.length
    for (let i = 0; i < cols.length; i++) {
      const r = cols[i].getBoundingClientRect()
      if (e.clientX < r.left + r.width / 2) {
        slot = i
        break
      }
    }
    if (slot !== colSlot) setColSlot(slot)
  }
  const onColumnsDrop = (e: React.DragEvent) => {
    if (colDrag === null) return
    e.preventDefault()
    // Slots count the dragged column itself; dropping right of it shifts the target by one.
    if (colSlot !== null && colFrom >= 0) api.moveColumn(colDrag, colSlot > colFrom ? colSlot - 1 : colSlot)
    setColDrag(null)
    setColSlot(null)
  }
  // A slot right before or after the dragged column means "no move": don't show a marker there.
  const showSlot = (slot: number) => colDrag !== null && colSlot === slot && slot !== colFrom && slot !== colFrom + 1
  const canEdit = board.permissions.PERMISSION_EDIT
  const canManage = board.permissions.PERMISSION_MANAGE
  const lastStackId = api.stacks[api.stacks.length - 1]?.id

  const onDragOver = (e: React.DragEvent<HTMLDivElement>, stackId: number) => {
    if (!drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-card-id]')).filter((el) => Number(el.dataset.cardId) !== drag.cardId)
    let index = cards.length
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) {
        index = i
        break
      }
    }
    if (!drop || drop.stackId !== stackId || drop.index !== index) setDrop({ stackId, index })
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (drag && drop) {
      // `index` counts visible cards only; convert to the full column (filters may hide some).
      const target = api.stacks.find((s) => s.id === drop.stackId)
      const all = (target?.cards ?? []).filter((c) => c.id !== drag.cardId)
      const visible = all.filter(filter.matches)
      const anchor = visible[drop.index]
      const fullIndex = anchor ? all.indexOf(anchor) : visible.length ? all.indexOf(visible[visible.length - 1]) + 1 : all.length
      api.move(drag.cardId, drop.stackId, fullIndex)
    }
    setDrag(null)
    setDrop(null)
  }

  return (
    <div className="board-page">
      <div className="page-header">
        <div className="breadcrumbs">
          <a href="/projects">Projects</a>
          <span className="sep">/</span>
          <span>{board.title}</span>
        </div>
        <div className="page-title-row">
          <h1>{projectKey(board.title)} board</h1>
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

      <div className="board-columns" onDragOver={onColumnsDragOver} onDrop={onColumnsDrop}>
        {api.stacks.map((stack, stackIndex) => {
          const cards = (stack.cards ?? []).filter(filter.matches)
          const others = cards.filter((c) => c.id !== drag?.cardId)
          const dropHere = drop?.stackId === stack.id
          return (
            <Fragment key={stack.id}>
              {showSlot(stackIndex) && <div className="col-drop-indicator" />}
              <div
                data-stack-id={stack.id}
                className={`board-column${drop?.stackId === stack.id ? ' is-over' : ''}${colDrag === stack.id ? ' is-col-dragging' : ''}`}
                onDragOver={(e) => onDragOver(e, stack.id)}
                onDrop={onDrop}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop((d) => (d?.stackId === stack.id ? null : d))
                }}
              >
                <ColumnHeader
                  board={board}
                  stack={stack}
                  count={cards.length}
                  total={stack.cards?.length ?? 0}
                  canManage={canManage}
                  onChanged={api.reload}
                  position={stackIndex}
                  columns={api.stacks.length}
                  onMove={(to) => api.moveColumn(stack.id, to)}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('application/x-avronext-column', String(stack.id))
                    setColDrag(stack.id)
                  }}
                  onDragEnd={() => {
                    setColDrag(null)
                    setColSlot(null)
                  }}
                />
                <div className="board-column-cards">
                  {cards.map((card) => (
                    <div key={card.id}>
                      {dropHere && drop?.index === others.indexOf(card) && <div className="drop-indicator" />}
                      <IssueCard
                        board={board}
                        card={card}
                        isDone={stack.id === lastStackId && api.stacks.length > 1}
                        onOpen={() => setIssue(card.id)}
                        draggable={canEdit}
                        dragging={drag?.cardId === card.id}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', String(card.id))
                          setDrag({ cardId: card.id, fromStack: stack.id })
                        }}
                        onDragEnd={() => {
                          setDrag(null)
                          setDrop(null)
                        }}
                      />
                    </div>
                  ))}
                  {dropHere && (drop?.index ?? 0) >= others.length && <div className="drop-indicator" />}
                </div>
                {canEdit &&
                  (creatingIn === stack.id ? (
                    <QuickCreate
                      filterLabels={board.labels.filter((l) => filter.filter.labels.includes(l.id))}
                      onCancel={() => setCreatingIn(null)}
                      onCreate={async (title, labelIds) => {
                        const r = await createIssue(board.id, stack.id, title, '', null, labelIds)
                        if (!r.ok) return api.setError(r.error)
                        api.addLocal(r.data)
                        if (r.data.labelsFailed.length) api.setError(`Created, but couldn’t add ${r.data.labelsFailed.join(', ')}.`)
                      }}
                    />
                  ) : (
                    <button className="column-create" onClick={() => setCreatingIn(stack.id)}>
                      <Icon name="plus" /> Create issue
                    </button>
                  ))}
              </div>
            </Fragment>
          )
        })}
        {showSlot(api.stacks.length) && <div className="col-drop-indicator" />}
        {canManage && <AddColumn boardId={board.id} order={api.stacks.length ? Math.max(...api.stacks.map((s) => s.order)) + 1 : 0} onAdded={api.reload} />}
        {api.stacks.length === 0 && !canManage && <div className="empty">This board has no columns yet.</div>}
      </div>

      {issue && <IssueModal board={board} api={api} cardId={issue} me={me} nextcloudUrl={nextcloudUrl} onClose={() => setIssue(null)} />}
    </div>
  )
}

/**
 * Inline "Create issue" at the bottom of a column. With a label filter on, the
 * new issue gets those labels (shown as removable chips), so it doesn't vanish
 * from the filtered board the moment it's created.
 */
function QuickCreate({
  filterLabels,
  onCreate,
  onCancel,
}: {
  filterLabels: DeckLabel[]
  onCreate: (title: string, labelIds: number[]) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [labels, setLabels] = useState(filterLabels)
  const filterKey = filterLabels.map((l) => l.id).join()
  // Follow the filter if it changes while the box is open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setLabels(filterLabels), [filterKey])
  const [pending, start] = useTransition()
  const ref = useRef<HTMLTextAreaElement>(null)
  const submit = () => {
    const t = title.trim()
    if (!t) return onCancel()
    start(async () => {
      await onCreate(t, labels.map((l) => l.id))
      setTitle('')
      ref.current?.focus()
    })
  }
  return (
    <div className="quick-create">
      <textarea
        ref={ref}
        autoFocus
        rows={2}
        placeholder="What needs to be done?"
        value={title}
        // Read-only, not disabled, while saving: a disabled box loses focus, and the next issue should be typeable right away.
        readOnly={pending}
        aria-busy={pending}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => !title.trim() && onCancel()}
      />
      <LabelChips labels={labels} onRemove={(l) => setLabels((all) => all.filter((x) => x.id !== l.id))} />
      <div className="quick-create-hint">Enter to create · Esc to cancel</div>
    </div>
  )
}

function ColumnHeader({
  board,
  stack,
  count,
  total,
  canManage,
  onChanged,
  position,
  columns,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  board: DeckBoard
  stack: DeckStack
  count: number
  total: number
  canManage: boolean
  onChanged: () => Promise<void>
  position: number
  columns: number
  onMove: (toIndex: number) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(stack.title)
  const save = async () => {
    setRenaming(false)
    if (title.trim() && title.trim() !== stack.title) {
      const r = await updateColumn(board.id, stack.id, title, stack.order)
      if (!r.ok) alert(r.error)
      await onChanged()
    } else setTitle(stack.title)
  }
  return (
    // Admins drag a column by its header to reorder it.
    <div
      className={`board-column-head${canManage && !renaming ? ' is-draggable' : ''}`}
      draggable={canManage && !renaming}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={canManage && !renaming ? 'Drag to move this column' : undefined}
    >
      {renaming ? (
        <input
          className="inline-input"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setTitle(stack.title)
              setRenaming(false)
            }
          }}
        />
      ) : (
        <h2>
          {stack.title} <span className="count">{count === total ? total : `${count} of ${total}`}</span>
        </h2>
      )}
      {canManage && !renaming && (
        <Menu align="right" label="Column actions" trigger={<span className="icon-btn icon-btn-sm"><Icon name="more" /></span>}>
          {(close) => (
            <>
              <button
                className="menu-item"
                onClick={() => {
                  close()
                  setRenaming(true)
                }}
              >
                <Icon name="edit" /> Rename
              </button>
              <button
                className="menu-item"
                disabled={position === 0}
                onClick={() => {
                  close()
                  onMove(position - 1)
                }}
              >
                <Icon name="chevronRight" className="rot-180" /> Move left
              </button>
              <button
                className="menu-item"
                disabled={position === columns - 1}
                onClick={() => {
                  close()
                  onMove(position + 1)
                }}
              >
                <Icon name="chevronRight" /> Move right
              </button>
              <button
                className="menu-item menu-item-danger"
                onClick={async () => {
                  close()
                  if (!confirm(`Delete the “${stack.title}” column${total ? ` and its ${total} issue${total === 1 ? '' : 's'}` : ''}?`)) return
                  const r = await deleteColumn(board.id, stack.id)
                  if (!r.ok) alert(r.error)
                  await onChanged()
                }}
              >
                <Icon name="trash" /> Delete
              </button>
            </>
          )}
        </Menu>
      )}
    </div>
  )
}

function AddColumn({ boardId, order, onAdded }: { boardId: number; order: number; onAdded: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [pending, start] = useTransition()
  if (!open) {
    return (
      <button className="add-column" onClick={() => setOpen(true)} aria-label="Add column" title="Add column">
        <Icon name="plus" size={20} />
      </button>
    )
  }
  const submit = () =>
    start(async () => {
      if (title.trim()) {
        const r = await createColumn(boardId, title, order)
        if (!r.ok) alert(r.error)
        await onAdded()
      }
      setTitle('')
      setOpen(false)
    })
  return (
    <div className="board-column board-column-new">
      <input
        className="inline-input"
        autoFocus
        placeholder="Column name"
        value={title}
        // Read-only, not disabled, while saving: a disabled box loses focus, and the next issue should be typeable right away.
        readOnly={pending}
        aria-busy={pending}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setOpen(false)
        }}
        onBlur={submit}
      />
    </div>
  )
}
