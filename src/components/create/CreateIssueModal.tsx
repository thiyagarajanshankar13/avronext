'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createIssue, loadIssueOptions } from '@/app/(app)/projects/actions'
import type { DeckLabel } from '@/lib/nextcloud/deck'
import { RichEditor, type RichEditorHandle } from '../editor/RichEditor'
import { boardFilterLabels } from '../project/boardFilterContext'
import { LabelChips } from '../project/LabelChips'
import { ISSUE_CREATED } from '../project/useBoard'
import { Modal } from '../Modal'
import { startNavProgress } from '../NavProgress'
import type { NavProject } from '../TopNav'

export function CreateIssueModal({
  projects,
  defaultProject,
  defaultStack,
  onClose,
}: {
  projects: NavProject[]
  defaultProject?: number
  defaultStack?: number
  onClose: () => void
}) {
  const router = useRouter()
  const [projectId, setProjectId] = useState<number | ''>(defaultProject ?? projects[0]?.id ?? '')
  const [stacks, setStacks] = useState<{ id: number; title: string }[]>([])
  const [stackId, setStackId] = useState<number | ''>('')
  const [projectLabels, setProjectLabels] = useState<DeckLabel[]>([])
  const [labels, setLabels] = useState<DeckLabel[]>([])
  const [prefilled, setPrefilled] = useState(false)
  const [title, setTitle] = useState('')
  const descEditor = useRef<RichEditorHandle>(null)
  const [due, setDue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!projectId) return
    let live = true
    setStacks([])
    setProjectLabels([])
    setLabels([])
    loadIssueOptions(projectId).then((r) => {
      if (!live) return
      if (!r.ok) return setError(r.error)
      setStacks(r.data.stacks)
      setStackId(r.data.stacks.find((s) => s.id === defaultStack)?.id ?? r.data.stacks[0]?.id ?? '')
      setProjectLabels(r.data.labels)
      // Opened from a board filtered by label(s): start with those labels.
      const fromFilter = r.data.labels.filter((l) => boardFilterLabels(projectId).includes(l.id))
      setLabels(fromFilter)
      setPrefilled(fromFilter.length > 0)
    })
    return () => {
      live = false
    }
  }, [projectId, defaultStack])

  const submit = () => {
    if (!projectId || !stackId || !title.trim()) return
    setError(null)
    start(async () => {
      const r = await createIssue(
        projectId,
        stackId,
        title,
        descEditor.current?.getMarkdown().trimEnd() ?? '',
        due ? new Date(due + 'T17:00:00').toISOString() : null,
        labels.map((l) => l.id),
      )
      if (!r.ok) return setError(r.error)
      // The issue exists either way; say which labels didn't stick.
      if (r.data.labelsFailed.length) alert(`Created, but couldn’t add ${r.data.labelsFailed.join(', ')}.`)
      // A board that is already open keeps its own state, so hand it the new issue.
      window.dispatchEvent(new CustomEvent(ISSUE_CREATED, { detail: { boardId: projectId, card: r.data } }))
      startNavProgress()
      router.push(`/projects/${projectId}?issue=${r.data.id}`)
    })
  }

  return (
    <Modal
      title="Create issue"
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending || !title.trim() || !stackId}>
            {pending ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      {projects.length === 0 ? (
        <p>You don’t have any projects yet. Create a project first.</p>
      ) : (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-row">
            <label className="field">
              <span>Project</span>
              <select value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={stackId} onChange={(e) => setStackId(Number(e.target.value))} disabled={!stacks.length}>
                {stacks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>
              Summary <em className="req">*</em>
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={255} />
          </label>
          <div className="field">
            <span>Description</span>
            {/* Same editor as the issue panel; attachments can be added once the issue exists. */}
            <div className="create-desc">
              <RichEditor ref={descEditor} initialMarkdown="" variant="compact" placeholder="Add a description… Type '/' for commands" onSubmit={submit} />
            </div>
          </div>
          {projectLabels.length > 0 && (
            <div className="field">
              <span>Labels</span>
              <LabelChips
                labels={labels}
                prefix={prefilled ? 'From the board filter' : 'Labels'}
                available={projectLabels}
                onRemove={(l) => setLabels((all) => all.filter((x) => x.id !== l.id))}
                onAdd={(l) => setLabels((all) => [...all, l])}
              />
            </div>
          )}
          <label className="field field-narrow">
            <span>Due date</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  )
}
