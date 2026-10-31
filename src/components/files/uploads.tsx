'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { TypeGlyph } from './FileIcon'
import { fileKind, fmtSize, notifyFilesChanged, parentOf } from './paths'

/**
 * The Files upload queue: lives in the Files layout so uploads carry on while
 * the user moves between folders. Files up to one chunk go in one request,
 * bigger ones as Nextcloud chunked uploads (so there's no size cap of ours).
 */

const CHUNK = 10 * 1024 * 1024
const PARALLEL = 3

type Status = 'queued' | 'uploading' | 'done' | 'error' | 'cancelled'
export type UploadJob = { id: number; file: File; path: string; overwrite: boolean; loaded: number; status: Status; error?: string }

type Ctx = { enqueue: (files: { file: File; path: string; overwrite: boolean }[]) => void }
const UploadsContext = createContext<Ctx | null>(null)

export function useUploads() {
  const ctx = useContext(UploadsContext)
  if (!ctx) throw new Error('useUploads outside UploadsProvider')
  return ctx
}

class UploadError extends Error {}

function send(url: string, body: Blob | null, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response)
      else reject(new UploadError((xhr.response as { error?: string } | null)?.error ?? `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new UploadError('Network error.'))
    xhr.onabort = () => reject(new DOMException('Cancelled', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(body)
  })
}

const api = (params: Record<string, string>) => `/api/upload?${new URLSearchParams(params)}`

async function uploadOne(job: UploadJob, onProgress: (loaded: number) => void, signal: AbortSignal) {
  const { file, path } = job
  const overwrite = job.overwrite ? '1' : '0'
  if (file.size <= CHUNK) return send(api({ op: 'put', path, overwrite }), file, onProgress, signal)
  const { id } = (await send(api({ op: 'start', path }), null, () => {}, signal)) as { id: string }
  try {
    for (let n = 1, offset = 0; offset < file.size; n++, offset += CHUNK) {
      const part = file.slice(offset, offset + CHUNK)
      await send(api({ op: 'chunk', id, n: String(n), path }), part, (l) => onProgress(offset + l), signal)
    }
    return await send(api({ op: 'finish', id, path, size: String(file.size), overwrite }), null, () => {}, signal)
  } catch (err) {
    fetch(api({ op: 'abort', id, path }), { method: 'POST' }).catch(() => null)
    throw err
  }
}

export function UploadsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const seq = useRef(0)
  const running = useRef(new Map<number, AbortController>())
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs

  const patch = useCallback((id: number, p: Partial<UploadJob>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j))), [])

  // Start queued jobs while fewer than PARALLEL are running.
  useEffect(() => {
    const free = PARALLEL - running.current.size
    if (free <= 0) return
    for (const job of jobs.filter((j) => j.status === 'queued').slice(0, free)) {
      const ctrl = new AbortController()
      running.current.set(job.id, ctrl)
      patch(job.id, { status: 'uploading', loaded: 0 })
      uploadOne(job, (loaded) => patch(job.id, { loaded }), ctrl.signal)
        .then(() => {
          patch(job.id, { status: 'done', loaded: job.file.size })
          notifyFilesChanged(parentOf(job.path))
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') patch(job.id, { status: 'cancelled' })
          else patch(job.id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed.' })
        })
        .finally(() => {
          running.current.delete(job.id)
          setJobs((js) => [...js]) // re-run the scheduler
        })
    }
  }, [jobs, patch])

  // Warn before closing the tab mid-upload.
  const busy = jobs.some((j) => j.status === 'queued' || j.status === 'uploading')
  useEffect(() => {
    if (!busy) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [busy])

  const enqueue = useCallback<Ctx['enqueue']>((files) => {
    setCollapsed(false)
    setJobs((js) => [...js.filter((j) => j.status !== 'done' || busyOf(js)), ...files.map((f) => ({ ...f, id: ++seq.current, loaded: 0, status: 'queued' as Status }))])
  }, [])

  const cancel = (id: number) => {
    const ctrl = running.current.get(id)
    if (ctrl) ctrl.abort()
    else patch(id, { status: 'cancelled' })
  }
  const retry = (id: number) => patch(id, { status: 'queued', error: undefined, loaded: 0 })
  const cancelAll = () => jobsRef.current.filter((j) => j.status === 'queued' || j.status === 'uploading').forEach((j) => cancel(j.id))

  const total = jobs.reduce((n, j) => n + j.file.size, 0)
  const loaded = jobs.reduce((n, j) => n + (j.status === 'done' ? j.file.size : j.loaded), 0)
  const done = jobs.filter((j) => j.status === 'done').length
  const failed = jobs.filter((j) => j.status === 'error').length

  return (
    <UploadsContext.Provider value={{ enqueue }}>
      {children}
      {jobs.length > 0 && (
        <div className={`uploads-panel${collapsed ? ' is-collapsed' : ''}`} role="status" aria-live="polite">
          <div className="uploads-head">
            <strong>
              {busy ? `Uploading ${done + 1 > jobs.length ? jobs.length : done + 1} of ${jobs.length}` : failed ? `${failed} upload${failed > 1 ? 's' : ''} failed` : `${done} upload${done === 1 ? '' : 's'} complete`}
            </strong>
            <span className="uploads-head-actions">
              {busy && (
                <button className="btn btn-subtle btn-sm" onClick={cancelAll}>
                  Cancel all
                </button>
              )}
              <button className="icon-btn icon-btn-sm" aria-label={collapsed ? 'Show uploads' : 'Hide uploads'} onClick={() => setCollapsed((c) => !c)}>
                <Icon name="chevronDown" className={collapsed ? 'rot-180' : ''} />
              </button>
              {!busy && (
                <button className="icon-btn icon-btn-sm" aria-label="Close" onClick={() => setJobs([])}>
                  <Icon name="close" />
                </button>
              )}
            </span>
          </div>
          {busy && (
            <div className="uploads-bar">
              <span style={{ width: `${total ? Math.round((loaded / total) * 100) : 0}%` }} />
            </div>
          )}
          {!collapsed && (
            <ul className="uploads-list">
              {jobs.map((j) => (
                <li key={j.id} className={`upload-row upload-${j.status}`}>
                  <TypeGlyph kind={fileKind({ name: j.file.name, isDir: false, mime: j.file.type })} size={20} />
                  <span className="upload-main">
                    <span className="upload-name" title={j.path}>
                      {j.file.name}
                    </span>
                    <span className="upload-sub">
                      {j.status === 'uploading'
                        ? `${fmtSize(j.loaded)} of ${fmtSize(j.file.size)}`
                        : j.status === 'error'
                          ? j.error
                          : j.status === 'cancelled'
                            ? 'Cancelled'
                            : j.status === 'done'
                              ? `Uploaded to ${parentOf(j.path) === '/' ? 'My files' : parentOf(j.path).split('/').pop()}`
                              : 'Waiting…'}
                    </span>
                  </span>
                  {j.status === 'done' && <Icon name="check" className="upload-ok" />}
                  {(j.status === 'queued' || j.status === 'uploading') && (
                    <button className="icon-btn icon-btn-sm" aria-label={`Cancel ${j.file.name}`} onClick={() => cancel(j.id)}>
                      <Icon name="close" />
                    </button>
                  )}
                  {(j.status === 'error' || j.status === 'cancelled') && (
                    <button className="btn btn-subtle btn-sm" onClick={() => retry(j.id)}>
                      Retry
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </UploadsContext.Provider>
  )
}

const busyOf = (js: UploadJob[]) => js.some((j) => j.status === 'queued' || j.status === 'uploading')
