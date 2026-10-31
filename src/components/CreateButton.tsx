'use client'
import { useState } from 'react'
import { CreateProjectModal } from './create/CreateProjectModal'
import { CreateSpaceModal } from './create/CreateSpaceModal'
import { Icon } from './Icon'

export function CreateButton({ kind, label }: { kind: 'project' | 'space'; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Icon name="plus" /> {label}
      </button>
      {open && kind === 'project' && <CreateProjectModal onClose={() => setOpen(false)} />}
      {open && kind === 'space' && <CreateSpaceModal onClose={() => setOpen(false)} />}
    </>
  )
}
