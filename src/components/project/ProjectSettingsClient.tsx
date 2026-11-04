'use client'
import { useState, useTransition } from 'react'
import { archiveProject, createLabel, deleteLabel, updateProject } from '@/app/(app)/projects/actions'
import { projectKey } from '@/lib/keys'
import type { DeckBoard } from '@/lib/nextcloud/deck'
import { useGoFresh } from '@/lib/useGoFresh'
import { ColorPicker, PROJECT_COLORS } from '../create/CreateProjectModal'
import { Icon } from '../Icon'
import { ProjectPeople } from './ProjectPeople'
import { LABEL_COLORS, labelStyle } from './status'


export function ProjectSettingsClient({ board, me }: { board: DeckBoard; me: string }) {
  const goFresh = useGoFresh()
  const [title, setTitle] = useState(board.title)
  const [color, setColor] = useState(PROJECT_COLORS.includes(board.color) ? board.color : board.color.toLowerCase())
  const [labelTitle, setLabelTitle] = useState('')
  const [labelColor, setLabelColor] = useState(LABEL_COLORS[0])
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const result = (r: { ok: boolean; error?: string }, ok: string) => {
    // The actions revalidate the project, so the page re-renders by itself.
    setMessage(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? 'Failed' })
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div className="breadcrumbs">
          <a href="/projects">Projects</a>
          <span className="sep">/</span>
          <a href={`/projects/${board.id}`}>{board.title}</a>
          <span className="sep">/</span>
          <span>Settings</span>
        </div>
        <h1>Project settings</h1>
      </div>
      {message && <div className={`banner ${message.ok ? 'banner-success' : 'banner-error'}`}>{message.text}</div>}

      <section className="settings-section">
        <h2>Details</h2>
        <div className="form-stack narrow">
          <label className="field">
            <span>Name</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
          </label>
          <div className="field">
            <span>Key</span>
            <div className="muted">{projectKey(title || board.title)} — derived from the name</div>
          </div>
          <div className="field">
            <span>Colour</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div>
            <button className="btn btn-primary" disabled={pending || !title.trim()} onClick={() => start(async () => result(await updateProject(board.id, title, color), 'Project saved.'))}>
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>Labels</h2>
        <div className="chip-list">
          {board.labels.map((l) => (
            <span key={l.id} className="label-chip label-chip-removable" style={labelStyle(l.color)}>
              {l.title}
              <button
                aria-label={`Delete label ${l.title}`}
                onClick={() => confirm(`Delete label “${l.title}”? It is removed from every issue.`) && start(async () => result(await deleteLabel(board.id, l.id), 'Label deleted.'))}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!labelTitle.trim()) return
            start(async () => {
              result(await createLabel(board.id, labelTitle, labelColor), 'Label added.')
              setLabelTitle('')
            })
          }}
        >
          <input placeholder="New label" value={labelTitle} onChange={(e) => setLabelTitle(e.target.value)} maxLength={100} />
          <div className="color-picker">
            {LABEL_COLORS.map((c) => (
              <button type="button" key={c} className={`swatch swatch-sm${labelColor === c ? ' is-selected' : ''}`} style={{ background: `#${c}` }} onClick={() => setLabelColor(c)} aria-label={`#${c}`} />
            ))}
          </div>
          <button className="btn btn-default" disabled={pending || !labelTitle.trim()}>
            Add label
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>People</h2>
        <ProjectPeople board={board} me={me} />
      </section>

      <section className="settings-section danger-zone">
        <h2>Archive project</h2>
        <p className="muted">Archived projects disappear from AvroNext. You can unarchive them in Nextcloud Deck.</p>
        <button
          className="btn btn-danger"
          disabled={pending}
          onClick={() =>
            confirm(`Archive “${board.title}”?`) &&
            start(async () => {
              const r = await archiveProject(board.id)
              if (r.ok) goFresh('/projects')
              else setMessage({ ok: false, text: r.error })
            })
          }
        >
          Archive project
        </button>
      </section>
    </div>
  )
}
