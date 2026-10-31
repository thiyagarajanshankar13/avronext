'use client'
import { useState, useTransition } from 'react'
import { createPage } from '@/app/(app)/spaces/actions'
import { useGoFresh } from '@/lib/useGoFresh'
import { Modal } from '../Modal'
import type { NavSpace } from '../TopNav'

export function CreatePageModal({
  spaces,
  defaultSpace,
  parentId,
  onClose,
}: {
  spaces: NavSpace[]
  defaultSpace?: number
  /** Page the user is looking at; offered as the parent when it's in the chosen space. */
  parentId?: number
  onClose: () => void
}) {
  const goFresh = useGoFresh()
  const [spaceId, setSpaceId] = useState<number | ''>(defaultSpace ?? spaces[0]?.id ?? '')
  const [asChild, setAsChild] = useState(Boolean(parentId))
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const canNest = Boolean(parentId) && spaceId === defaultSpace

  const submit = () => {
    if (!spaceId || !title.trim()) return
    start(async () => {
      const r = await createPage(spaceId, canNest && asChild ? parentId! : null, title)
      if (!r.ok) return setError(r.error)
      goFresh(`/spaces/${spaceId}/pages/${r.data.id}/edit`)
    })
  }

  return (
    <Modal
      title="Create page"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending || !title.trim() || !spaceId}>
            {pending ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      {spaces.length === 0 ? (
        <p>You don’t have any spaces yet. Create a space first.</p>
      ) : (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {error && <div className="banner banner-error">{error}</div>}
          <label className="field">
            <span>Space</span>
            <select value={spaceId} onChange={(e) => setSpaceId(Number(e.target.value))}>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji ? `${s.emoji} ` : ''}
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Title <em className="req">*</em>
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={200} />
          </label>
          {canNest && (
            <label className="check">
              <input type="checkbox" checked={asChild} onChange={(e) => setAsChild(e.target.checked)} />
              Create as a child of the current page
            </label>
          )}
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  )
}
