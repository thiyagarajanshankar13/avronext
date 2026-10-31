'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { addComment, deleteComment, loadComments } from '@/app/(app)/projects/actions'
import { fmtDateTime, fmtRelative, isoToDateInput } from '@/lib/format'
import { issueKey } from '@/lib/keys'
import { useMarkdownHtml } from '@/lib/markdown.client'
import type { DeckAttachment, DeckBoard, DeckComment } from '@/lib/nextcloud/deck'
import { useUploadQueue } from '../attachments/Attachments'
import { RichEditor, type RichEditorHandle } from '../editor/RichEditor'
import { uploadWithProgress } from '../attachments/upload'
import { useFileDrop } from '../attachments/useFileDrop'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { Lozenge } from '../Lozenge'
import { Menu } from '../Menu'
import { IssueAttachments } from './IssueAttachments'
import { labelStyle, statusTone } from './status'
import type { BoardApi } from './useBoard'

export function IssueModal({
  board,
  api,
  cardId,
  me,
  nextcloudUrl,
  onClose,
}: {
  board: DeckBoard
  api: BoardApi
  cardId: number
  me: string
  nextcloudUrl: string
  onClose: () => void
}) {
  const found = api.locate(cardId)
  const canEdit = board.permissions.PERMISSION_EDIT

  // Attachments: the list lives here so drops/pastes anywhere on the issue feed the same upload queue.
  const [attachments, setAttachments] = useState<DeckAttachment[] | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const queue = useUploadQueue(async (file, onProgress) => {
    const stackId = api.locate(cardId)?.stack.id
    if (!stackId) throw new Error('This issue no longer exists.')
    const created = await uploadWithProgress<DeckAttachment>(`/api/attachments/card/${cardId}?board=${board.id}&stack=${stackId}`, file, onProgress)
    setAttachments((all) => [created, ...(all ?? [])])
    api.adjustAttachments(cardId, 1)
  })
  const dragging = useFileDrop(modalRef, queue.add, Boolean(found) && canEdit)

  useEffect(() => {
    // Escape inside a field or the description editor belongs to that field.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement).closest('input,textarea,[contenteditable="true"]') && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  if (!found) {
    return (
      <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ maxWidth: 420 }}>
          <div className="modal-body">
            <p>This issue doesn’t exist any more, or it was archived.</p>
            <button className="btn btn-default" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }
  const { card, stack } = found
  const stackIds = api.stacks.map((s) => s.id)
  const key = issueKey(board.title, card.id)
  const owner = typeof card.owner === 'string' ? { uid: card.owner, displayname: card.owner } : card.owner

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={modalRef}
        className="modal issue-modal"
        role="dialog"
        aria-modal="true"
        aria-label={card.title}
        onPaste={(e) => {
          // Pasted screenshots/files become attachments (text pastes are left alone).
          const files = Array.from(e.clipboardData.files)
          if (!files.length || !canEdit) return
          e.preventDefault()
          queue.add(files.map((f) => (f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.png`, { type: f.type }))))
        }}
      >
        {dragging && (
          <div className="drop-overlay">
            <Icon name="paperclip" size={28} />
            Drop files to attach them to {key}
          </div>
        )}
        <div className="issue-modal-top">
          <div className="breadcrumbs">
            <span className="project-dot" style={{ background: `#${board.color}` }} />
            <span>{board.title}</span>
            <span className="sep">/</span>
            <span className="issue-key">
              <Icon name="task" className="type-icon" /> {key}
            </span>
          </div>
          <div className="issue-modal-actions">
            <button
              className="icon-btn"
              title="Copy link"
              onClick={() => navigator.clipboard?.writeText(`${location.origin}/projects/${board.id}?issue=${card.id}`)}
            >
              <Icon name="link" />
            </button>
            <a className="icon-btn" title="Open in Nextcloud Deck" href={`${nextcloudUrl}/apps/deck/board/${board.id}/card/${card.id}`} target="_blank" rel="noopener noreferrer">
              <Icon name="external" />
            </a>
            {canEdit && (
              <Menu align="right" label="More actions" trigger={<span className="icon-btn"><Icon name="more" /></span>}>
                {(close) => (
                  <>
                    <button
                      className="menu-item"
                      onClick={() => {
                        close()
                        onClose()
                        api.remove(card.id, 'archive')
                      }}
                    >
                      <Icon name="archive" /> Archive
                    </button>
                    <button
                      className="menu-item menu-item-danger"
                      onClick={() => {
                        close()
                        if (confirm(`Delete ${key}? This can be undone from Nextcloud Deck’s deleted items.`)) {
                          onClose()
                          api.remove(card.id, 'delete')
                        }
                      }}
                    >
                      <Icon name="trash" /> Delete
                    </button>
                  </>
                )}
              </Menu>
            )}
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
        </div>

        <div className="issue-modal-grid">
          <div className="issue-main">
            <EditableTitle value={card.title} disabled={!canEdit} onSave={(title) => api.update(card.id, { title })} />
            <Description value={card.description ?? ''} disabled={!canEdit} onSave={(description) => api.update(card.id, { description })} />
            <section className="issue-section">
              <div className="section-row">
                <h3>
                  Attachments{attachments?.length ? <span className="count-pill">{attachments.length}</span> : null}
                </h3>
                {canEdit && (
                  <button className="btn btn-default btn-sm" onClick={() => fileInput.current?.click()}>
                    <Icon name="paperclip" /> Attach
                  </button>
                )}
              </div>
              <IssueAttachments
                board={board}
                stackId={stack.id}
                cardId={card.id}
                me={me}
                canEdit={canEdit}
                list={attachments}
                setList={setAttachments}
                queue={queue}
                inputRef={fileInput}
                onCount={(d) => api.adjustAttachments(card.id, d)}
              />
            </section>
            <Comments cardId={card.id} me={me} canComment={board.permissions.PERMISSION_READ} />
          </div>

          <aside className="issue-side">
            <div className="issue-status-row">
              <select
                className={`status-select status-${statusTone(stackIds, stack.id, card.done)}`}
                value={stack.id}
                disabled={!canEdit}
                onChange={(e) => api.move(card.id, Number(e.target.value), 0)}
                aria-label="Status"
              >
                {api.stacks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              {canEdit && (
                <button className={`btn ${card.done ? 'btn-success' : 'btn-default'}`} onClick={() => api.update(card.id, { done: card.done ? null : 'now' })}>
                  <Icon name="check" /> {card.done ? 'Done' : 'Mark done'}
                </button>
              )}
            </div>

            <div className="details-panel">
              <div className="details-heading">Details</div>
              <div className="detail-row">
                <span className="detail-label">Assignee</span>
                <div className="detail-value">
                  <Assignees board={board} api={api} cardId={card.id} assigned={card.assignedUsers.map((a) => a.participant)} me={me} disabled={!canEdit} />
                </div>
              </div>
              <div className="detail-row">
                <span className="detail-label">Labels</span>
                <div className="detail-value">
                  <Labels board={board} api={api} cardId={card.id} labels={card.labels} disabled={!canEdit} />
                </div>
              </div>
              <div className="detail-row">
                <span className="detail-label">Due date</span>
                <div className="detail-value">
                  <input
                    type="date"
                    className="inline-input"
                    value={isoToDateInput(card.duedate)}
                    disabled={!canEdit}
                    onChange={(e) => api.update(card.id, { duedate: e.target.value ? new Date(e.target.value + 'T17:00:00').toISOString() : null })}
                  />
                </div>
              </div>
              <div className="detail-row">
                <span className="detail-label">Reporter</span>
                <div className="detail-value person">
                  <Avatar uid={owner.uid} name={owner.displayname} size={24} /> {owner.displayname}
                </div>
              </div>
            </div>
            <div className="issue-meta">
              <div>Created {fmtDateTime(card.createdAt)}</div>
              <div>Updated {fmtRelative(card.lastModified)}</div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function EditableTitle({ value, disabled, onSave }: { value: string; disabled: boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const v = draft.trim()
    if (v && v !== value) onSave(v)
    else setDraft(value)
  }
  return (
    <textarea
      className="issue-title-input"
      rows={1}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLTextAreaElement).blur()
        }
        if (e.key === 'Escape') {
          setDraft(value)
          ;(e.target as HTMLTextAreaElement).blur()
        }
      }}
      aria-label="Summary"
    />
  )
}

function Description({ value, disabled, onSave }: { value: string; disabled: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const editor = useRef<RichEditorHandle>(null)
  const html = useMarkdownHtml(value)
  const save = () => {
    // Only write when something changed, so an untouched description keeps its exact Markdown.
    if (editor.current?.isDirty()) onSave(editor.current.getMarkdown().trimEnd())
    setEditing(false)
  }
  return (
    <section className="issue-section">
      <h3>Description</h3>
      {editing ? (
        <div className="desc-editor">
          <RichEditor ref={editor} initialMarkdown={value} variant="compact" autoFocus placeholder="Add a description… Type '/' for commands" onSubmit={save} />
          <div className="btn-row">
            <button className="btn btn-primary" onClick={save}>
              Save
            </button>
            <button className="btn btn-subtle" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : value.trim() ? (
        <div
          className={`prose desc-view${disabled ? '' : ' is-editable'}`}
          onClick={(e) => {
            if (disabled || (e.target as HTMLElement).closest('a')) return
            setEditing(true)
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <button className="desc-placeholder" disabled={disabled} onClick={() => setEditing(true)}>
          {disabled ? 'No description' : 'Add a description…'}
        </button>
      )}
    </section>
  )
}

function Comments({ cardId, me, canComment }: { cardId: number; me: string; canComment: boolean }) {
  const [comments, setComments] = useState<DeckComment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    let live = true
    setComments(null)
    loadComments(cardId).then((r) => {
      if (!live) return
      if (r.ok) setComments(r.data)
      else setError(r.error)
    })
    return () => {
      live = false
    }
  }, [cardId])

  const post = () => {
    const message = draft.trim()
    if (!message) return
    start(async () => {
      const r = await addComment(cardId, message)
      if (!r.ok) return setError(r.error)
      setComments((c) => [...(c ?? []), r.data])
      setDraft('')
    })
  }

  return (
    <section className="issue-section">
      <h3>Activity</h3>
      {canComment && (
        <div className="comment-new">
          <Avatar uid={me} size={32} />
          <div className="comment-new-body">
            <textarea
              rows={draft ? 3 : 1}
              placeholder="Add a comment…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post()
              }}
            />
            {draft && (
              <div className="btn-row">
                <button className="btn btn-primary" onClick={post} disabled={pending}>
                  Save
                </button>
                <button className="btn btn-subtle" onClick={() => setDraft('')}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {error && <div className="banner banner-error">{error}</div>}
      {comments === null ? (
        <div className="muted">Loading comments…</div>
      ) : comments.length === 0 ? (
        <div className="muted small">No comments yet.</div>
      ) : (
        <ul className="comment-list">
          {[...comments].reverse().map((c) => (
            <li key={c.id} className="comment">
              <Avatar uid={c.actorId} name={c.actorDisplayName} size={32} />
              <div>
                <div className="comment-head">
                  <strong>{c.actorDisplayName}</strong>
                  <span className="muted" title={fmtDateTime(c.creationDateTime)}>
                    {fmtRelative(c.creationDateTime)}
                  </span>
                </div>
                <div className="comment-body">{c.message}</div>
                {c.actorId === me && (
                  <button
                    className="link-btn small"
                    onClick={async () => {
                      const r = await deleteComment(cardId, c.id)
                      if (r.ok) setComments((all) => all?.filter((x) => x.id !== c.id) ?? null)
                      else setError(r.error)
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Assignees({
  board,
  api,
  cardId,
  assigned,
  me,
  disabled,
}: {
  board: DeckBoard
  api: BoardApi
  cardId: number
  assigned: { uid: string; displayname: string }[]
  me: string
  disabled: boolean
}) {
  const ids = new Set(assigned.map((a) => a.uid))
  return (
    <div className="chip-list">
      {assigned.length === 0 && <span className="muted">Unassigned</span>}
      {assigned.map((u) => (
        <span key={u.uid} className="person">
          <Avatar uid={u.uid} name={u.displayname} size={24} /> {u.displayname}
        </span>
      ))}
      {!disabled && (
        <>
          {!ids.has(me) && board.users.some((u) => u.uid === me) && (
            <button className="link-btn" onClick={() => api.toggleAssignee(cardId, board.users.find((u) => u.uid === me)!, true)}>
              Assign to me
            </button>
          )}
          <Menu align="right" label="Change assignees" trigger={<span className="link-btn">Edit</span>}>
            {() =>
              board.users.map((u) => (
                <label key={u.uid} className="menu-item menu-check">
                  <input type="checkbox" checked={ids.has(u.uid)} onChange={(e) => api.toggleAssignee(cardId, u, e.target.checked)} />
                  <Avatar uid={u.uid} name={u.displayname} size={20} /> {u.displayname}
                </label>
              ))
            }
          </Menu>
        </>
      )}
    </div>
  )
}

function Labels({
  board,
  api,
  cardId,
  labels,
  disabled,
}: {
  board: DeckBoard
  api: BoardApi
  cardId: number
  labels: { id: number; title: string; color: string }[]
  disabled: boolean
}) {
  const ids = new Set(labels.map((l) => l.id))
  return (
    <div className="chip-list">
      {labels.length === 0 && <span className="muted">None</span>}
      {labels.map((l) => (
        <span key={l.id} className="label-chip" style={labelStyle(l.color)}>
          {l.title}
        </span>
      ))}
      {!disabled && board.labels.length > 0 && (
        <Menu align="right" label="Change labels" trigger={<span className="link-btn">Edit</span>}>
          {() =>
            board.labels.map((l) => (
              <label key={l.id} className="menu-item menu-check">
                <input type="checkbox" checked={ids.has(l.id)} onChange={(e) => api.toggleLabel(cardId, l, e.target.checked)} />
                <span className="label-chip" style={labelStyle(l.color)}>
                  {l.title}
                </span>
              </label>
            ))
          }
        </Menu>
      )}
    </div>
  )
}

export function StatusLozenge({ stackIds, stackId, title, done }: { stackIds: number[]; stackId: number; title: string; done?: string | null }) {
  return <Lozenge tone={statusTone(stackIds, stackId, done)}>{title}</Lozenge>
}
