'use client'
import { useRef, useState } from 'react'
import { fmtDate } from '@/lib/format'
import { Icon } from '../Icon'
import { fmtSize, isImageName } from './upload'

export type AttachmentItem = {
  key: string
  name: string
  size?: number
  /** Unix seconds. */
  date?: number
  by?: string
  /** Opens the file (images in a tab, others download). */
  href: string
  downloadHref: string
  /** Thumbnail URL (Nextcloud preview or the image itself). */
  thumb?: string | null
  canDelete: boolean
}

type Upload = { id: number; name: string; progress: number; error?: string }

/**
 * Upload queue with per-file progress; `add` takes files from the picker,
 * drops or pastes. Files go up one at a time: parallel uploads into one
 * Nextcloud folder can race on names (and lock SQLite-backed instances).
 */
export function useUploadQueue(upload: (file: File, onProgress: (fraction: number) => void) => Promise<void>) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const chain = useRef<Promise<void>>(Promise.resolve())
  const add = (files: File[]) => {
    for (const file of files) {
      const id = Date.now() + Math.random()
      setUploads((all) => [...all, { id, name: file.name, progress: 0 }])
      chain.current = chain.current.then(() =>
        upload(file, (progress) => setUploads((all) => all.map((u) => (u.id === id ? { ...u, progress } : u))))
          .then(() => setUploads((all) => all.filter((u) => u.id !== id)))
          .catch((err: unknown) =>
            setUploads((all) => all.map((u) => (u.id === id ? { ...u, error: err instanceof Error ? err.message : 'Upload failed.' } : u))),
          ),
      )
    }
  }
  const dismiss = (id: number) => setUploads((all) => all.filter((u) => u.id !== id))
  return { uploads, add, dismiss }
}

export type UploadQueue = ReturnType<typeof useUploadQueue>

/**
 * Confluence/Jira-style attachment panel: thumbnails for images, file tiles
 * for everything else, upload progress, delete. Storage is up to the caller.
 */
export function Attachments({
  items,
  canUpload,
  queue,
  remove,
  loading,
  error,
  inputRef,
}: {
  items: AttachmentItem[]
  canUpload: boolean
  queue: UploadQueue
  remove: (item: AttachmentItem) => Promise<void>
  loading?: boolean
  error?: string | null
  /** Lets the parent open the file picker (e.g. from an "Attach" button elsewhere). */
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  const ownInput = useRef<HTMLInputElement>(null)
  const input = inputRef ?? ownInput
  const { uploads } = queue
  const [failure, setFailure] = useState<string | null>(null)

  return (
    <div className="attachments">
      {(error || failure) && <div className="banner banner-error">{error || failure}</div>}
      {loading ? (
        <div className="muted small">Loading attachments…</div>
      ) : items.length === 0 && uploads.length === 0 ? (
        <div className="attachments-empty muted small">
          {canUpload ? (
            <>
              No attachments yet.{' '}
              <button type="button" className="link-btn" onClick={() => input.current?.click()}>
                Browse
              </button>{' '}
              or drop files here.
            </>
          ) : (
            'No attachments.'
          )}
        </div>
      ) : (
        <ul className="attachment-grid">
          {uploads.map((u) => (
            <li key={`u${u.id}`} className={`attachment-tile is-uploading${u.error ? ' has-error' : ''}`}>
              <div className="attachment-thumb">
                <Icon name="upload" size={22} />
              </div>
              <div className="attachment-meta">
                <span className="attachment-name" title={u.name}>
                  {u.name}
                </span>
                {u.error ? (
                  <span className="attachment-error">
                    {u.error}{' '}
                    <button type="button" className="link-btn small" onClick={() => queue.dismiss(u.id)}>
                      Dismiss
                    </button>
                  </span>
                ) : (
                  <span className="progress">
                    <span style={{ width: `${Math.round(u.progress * 100)}%` }} />
                  </span>
                )}
              </div>
            </li>
          ))}
          {items.map((item) => (
            <li key={item.key} className="attachment-tile">
              <a className="attachment-thumb" href={item.href} target={isImageName(item.name) ? '_blank' : undefined} rel="noopener" title={`Open ${item.name}`}>
                <Thumb item={item} />
              </a>
              <div className="attachment-meta">
                <a className="attachment-name" href={item.href} target={isImageName(item.name) ? '_blank' : undefined} rel="noopener" title={item.name}>
                  {item.name}
                </a>
                <span className="attachment-sub">
                  {[fmtSize(item.size), item.date ? fmtDate(item.date) : '', item.by].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="attachment-actions">
                <a className="icon-btn icon-btn-sm" href={item.downloadHref} title="Download" aria-label={`Download ${item.name}`}>
                  <Icon name="download" size={14} />
                </a>
                {item.canDelete && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm"
                    title="Delete"
                    aria-label={`Delete ${item.name}`}
                    onClick={async () => {
                      if (!confirm(`Delete “${item.name}”?`)) return
                      setFailure(null)
                      try {
                        await remove(item)
                      } catch (err) {
                        setFailure(err instanceof Error ? err.message : 'Delete failed.')
                      }
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            queue.add(files)
          }}
        />
      )}
    </div>
  )
}

function Thumb({ item }: { item: AttachmentItem }) {
  const [failed, setFailed] = useState(false)
  if (item.thumb && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.thumb} alt="" loading="lazy" onError={() => setFailed(true)} />
  }
  const ext = item.name.includes('.') ? item.name.split('.').pop()!.slice(0, 4).toUpperCase() : 'FILE'
  return (
    <span className="file-badge">
      <Icon name="page" size={22} />
      <span>{ext}</span>
    </span>
  )
}
