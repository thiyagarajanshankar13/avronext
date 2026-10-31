'use client'
import { useState, useTransition } from 'react'
import { createProject } from '@/app/(app)/projects/actions'
import { projectKey } from '@/lib/keys'
import { useGoFresh } from '@/lib/useGoFresh'
import { Modal } from '../Modal'

export const PROJECT_COLORS = ['0c66e4', '1f845a', '6e5dc6', 'c25100', 'ae2e24', '227d9b', '943d73', '5b7f24', '626f86']

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="color-picker" role="radiogroup">
      {PROJECT_COLORS.map((c) => (
        <button
          type="button"
          key={c}
          role="radio"
          aria-checked={value === c}
          aria-label={`#${c}`}
          className={`swatch${value === c ? ' is-selected' : ''}`}
          style={{ background: `#${c}` }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const goFresh = useGoFresh()
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const submit = () => {
    if (!title.trim()) return
    start(async () => {
      const r = await createProject(title, color)
      if (!r.ok) return setError(r.error)
      goFresh(`/projects/${r.data.id}`)
    })
  }
  return (
    <Modal
      title="Create project"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending || !title.trim()}>
            {pending ? 'Creating…' : 'Create project'}
          </button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {error && <div className="banner banner-error">{error}</div>}
        <label className="field">
          <span>
            Name <em className="req">*</em>
          </span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={100} />
        </label>
        <div className="field">
          <span>Key</span>
          <div className="muted">{title.trim() ? projectKey(title) : '—'} (issues will be numbered like {projectKey(title || 'Project')}-42)</div>
        </div>
        <div className="field">
          <span>Colour</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <p className="hint">Creates a Nextcloud Deck board with “To do”, “In progress” and “Done” columns. Add people in Project settings.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
