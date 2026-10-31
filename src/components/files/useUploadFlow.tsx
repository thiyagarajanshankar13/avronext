'use client'
import { useState, type ReactNode } from 'react'
import { ensureFolders, reloadView } from '@/app/(app)/files/actions'
import { Modal } from '../Modal'
import type { Picked } from './dropped'
import { freeName, joinPath } from './paths'
import { useUploads } from './uploads'

type Choice = 'replace' | 'keep' | 'skip'
type Pending = { dir: string; files: Picked[]; dirs: string[]; clashes: string[]; resolve: (c: Choice | null) => void }

/**
 * Upload into a folder: checks the folder's current names, asks once what to
 * do about clashes (replace / keep both / skip), creates sub-folders, queues files.
 */
export function useUploadFlow(): { start: (dir: string, picked: { files: Picked[]; dirs: string[] }, onError: (msg: string) => void) => void; dialog: ReactNode } {
  const { enqueue } = useUploads()
  const [pending, setPending] = useState<Pending | null>(null)

  const start = async (dir: string, picked: { files: Picked[]; dirs: string[] }, onError: (msg: string) => void) => {
    const listing = await reloadView('files', dir)
    if (!listing.ok) return onError(listing.error)
    const existing = new Map(listing.data.items.map((i) => [i.name, i.isDir]))
    const top = (rel: string) => rel.split('/')[0]
    const tops = [...new Set([...picked.files.map((f) => top(f.rel)), ...picked.dirs.map(top)])]
    const clashes = tops.filter((n) => existing.has(n))

    let choice: Choice | null = 'keep'
    if (clashes.length) {
      choice = await new Promise<Choice | null>((resolve) => setPending({ dir, ...picked, clashes, resolve }))
      setPending(null)
      if (!choice) return
    }

    // Top-level names after "keep both" renames; skipped ones drop out.
    const taken = new Set([...existing.keys(), ...tops.filter((n) => !existing.has(n))])
    const rename = new Map<string, string | null>()
    for (const name of clashes) {
      if (choice === 'skip') rename.set(name, null)
      else if (choice === 'keep') {
        const fresh = freeName(name, taken)
        taken.add(fresh)
        rename.set(name, fresh)
      }
    }
    const remap = (rel: string) => {
      const [first, ...rest] = rel.split('/')
      if (!rename.has(first)) return rel
      const to = rename.get(first)
      return to === null ? null : [to, ...rest].join('/')
    }

    const dirs = picked.dirs.map(remap).filter((d): d is string => d !== null)
    if (dirs.length) {
      const r = await ensureFolders(dir, dirs)
      if (!r.ok) return onError(r.error)
    }
    const jobs = picked.files
      .map((f) => ({ f, rel: remap(f.rel) }))
      .filter((x): x is { f: Picked; rel: string } => x.rel !== null)
      .map(({ f, rel }) => ({ file: f.file, path: joinPath(dir, rel), overwrite: choice === 'replace' }))
    if (jobs.length) enqueue(jobs)
  }

  const dialog = pending && (
    <Modal
      title={pending.clashes.length === 1 ? `“${pending.clashes[0]}” already exists` : `${pending.clashes.length} items already exist`}
      onClose={() => pending.resolve(null)}
      footer={
        <>
          <button className="btn btn-subtle" onClick={() => pending.resolve(null)}>
            Cancel
          </button>
          <button className="btn btn-default" onClick={() => pending.resolve('skip')}>
            Skip
          </button>
          <button className="btn btn-default" onClick={() => pending.resolve('keep')}>
            Keep both
          </button>
          <button className="btn btn-primary" onClick={() => pending.resolve('replace')}>
            Replace
          </button>
        </>
      }
    >
      <p>
        {pending.clashes.length === 1 ? 'An item with this name' : 'Items with these names'} already {pending.clashes.length === 1 ? 'is' : 'are'} in{' '}
        <strong>{pending.dir === '/' ? 'My files' : pending.dir.split('/').pop()}</strong>.
      </p>
      {pending.clashes.length > 1 && (
        <ul className="files-clash-list">
          {pending.clashes.slice(0, 8).map((n) => (
            <li key={n}>{n}</li>
          ))}
          {pending.clashes.length > 8 && <li className="muted">and {pending.clashes.length - 8} more</li>}
        </ul>
      )}
      <p className="muted small">
        <strong>Replace</strong> overwrites them (Nextcloud keeps the old version). <strong>Keep both</strong> adds a number to the new names. Folders are merged
        when replacing.
      </p>
    </Modal>
  )

  return { start, dialog }
}
