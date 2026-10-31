'use client'
import { useState, useTransition } from 'react'
import { createSpace } from '@/app/(app)/spaces/actions'
import { useGoFresh } from '@/lib/useGoFresh'
import { Modal } from '../Modal'

const EMOJIS = ['📘', '🛠️', '🚀', '📣', '💡', '📊', '🧭', '🎯', '🏠', '🧪', '📝', '🤝']

export function CreateSpaceModal({ onClose }: { onClose: () => void }) {
  const goFresh = useGoFresh()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const submit = () => {
    if (!name.trim()) return
    start(async () => {
      const r = await createSpace(name, emoji)
      if (!r.ok) return setError(r.error)
      goFresh(`/spaces/${r.data.id}`)
    })
  }
  return (
    <Modal
      title="Create space"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending || !name.trim()}>
            {pending ? 'Creating…' : 'Create space'}
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
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={100} />
        </label>
        <div className="field">
          <span>Icon</span>
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button type="button" key={e} className={`emoji-btn${emoji === e ? ' is-selected' : ''}`} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <p className="hint">Creates a Nextcloud Collective (and a team for its members). Add people in Space settings.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
