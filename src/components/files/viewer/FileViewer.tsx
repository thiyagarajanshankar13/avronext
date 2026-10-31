'use client'
import dynamic from 'next/dynamic'
import { Component, useEffect, useState, type ReactNode } from 'react'
import type { FileRow } from '@/app/(app)/files/data'
import { useMarkdownHtml } from '@/lib/markdown.client'
import { Icon } from '../../Icon'
import { FileIcon } from '../FileIcon'
import { canView, downloadUrl, extOf, fileKind, fmtSize, previewUrl, viewUrl } from '../paths'

// The Office viewers (and their libraries) load only when such a file is opened.
const Loading = () => <ViewerMessage text="Opening…" />
const DocxView = dynamic(() => import('./DocxView'), { ssr: false, loading: Loading })
const SheetView = dynamic(() => import('./SheetView'), { ssr: false, loading: Loading })
const SlidesView = dynamic(() => import('./SlidesView'), { ssr: false, loading: Loading })

/** Biggest file the in-browser readers (text, Office) will load. */
const READ_LIMIT = 20 * 1024 * 1024
const TEXT_LIMIT = 2 * 1024 * 1024
const NATIVE_IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg']

/** Full-screen, read-only viewer; ← → step through the folder's files. */
export function FileViewer({ items, path, onNavigate, onClose }: { items: FileRow[]; path: string; onNavigate: (path: string) => void; onClose: () => void }) {
  const index = Math.max(0, items.findIndex((i) => i.path === path))
  const item = items[index]
  const viewable = items.filter((i) => canView(i))
  const at = viewable.findIndex((i) => i.path === path)
  const prev = at > 0 ? viewable[at - 1] : null
  const next = at >= 0 && at < viewable.length - 1 ? viewable[at + 1] : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, select')) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && prev) onNavigate(prev.path)
      else if (e.key === 'ArrowRight' && next) onNavigate(next.path)
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [prev, next, onNavigate, onClose])

  if (!item) return null
  const kind = fileKind(item)
  const opensInTab = kind === 'pdf' || kind === 'video' || kind === 'audio' || (kind === 'image' && NATIVE_IMAGE.includes(extOf(item.name)))

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={item.name}>
      <header className="viewer-bar">
        <span className="viewer-title">
          <FileIcon item={item} size={20} />
          <span className="viewer-name" title={item.name}>
            {item.name}
          </span>
          <span className="viewer-meta">{fmtSize(item.size)}</span>
        </span>
        <span className="viewer-actions">
          {opensInTab && (
            <a className="btn btn-subtle viewer-btn" href={viewUrl(item.path)} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> <span className="hide-sm">Open in new tab</span>
            </a>
          )}
          <a className="btn btn-subtle viewer-btn" href={downloadUrl(item.path)}>
            <Icon name="download" /> <span className="hide-sm">Download</span>
          </a>
          <button className="icon-btn viewer-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </span>
      </header>
      <div className="viewer-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {prev && (
          <button className="viewer-nav viewer-prev" aria-label={`Previous: ${prev.name}`} onClick={() => onNavigate(prev.path)}>
            <Icon name="chevronLeft" size={28} />
          </button>
        )}
        <Body key={item.path} item={item} />
        {next && (
          <button className="viewer-nav viewer-next" aria-label={`Next: ${next.name}`} onClick={() => onNavigate(next.path)}>
            <Icon name="chevronRight" size={28} />
          </button>
        )}
      </div>
    </div>
  )
}

function Body({ item }: { item: FileRow }) {
  const kind = fileKind(item)
  const ext = extOf(item.name)
  if (!canView(item)) return <NoPreview item={item} text="There’s no preview for this type of file." />
  if (kind === 'image') {
    const src = NATIVE_IMAGE.includes(ext) ? viewUrl(item.path) : previewUrl(item.id, 1600)
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="viewer-image" src={src} alt={item.name} />
  }
  if (kind === 'pdf') return <iframe className="viewer-frame viewer-pdf" src={viewUrl(item.path)} title={item.name} />
  if (kind === 'video') return <video className="viewer-media" src={viewUrl(item.path)} controls autoPlay playsInline />
  if (kind === 'audio')
    return (
      <div className="viewer-audio">
        <FileIcon item={item} size={96} />
        <audio src={viewUrl(item.path)} controls autoPlay />
      </div>
    )
  const limit = kind === 'text' || kind === 'markdown' ? TEXT_LIMIT : READ_LIMIT
  if (item.size > limit) return <NoPreview item={item} text={`This file is too big to preview here (over ${fmtSize(limit)}).`} />
  if (kind === 'text' || kind === 'markdown') return <TextView item={item} markdown={kind === 'markdown'} />
  if (kind === 'word') return <Loaded item={item} render={(buf) => <DocxView data={buf} />} />
  if (kind === 'sheet') return <Loaded item={item} render={(buf) => <SheetView data={buf} name={item.name} />} />
  if (kind === 'slides') return <Loaded item={item} render={(buf) => <SlidesView data={buf} />} />
  return <NoPreview item={item} text="There’s no preview for this type of file." />
}

/** Downloads the file into memory, then hands it to a reader. */
function Loaded({ item, render }: { item: FileRow; render: (buf: ArrayBuffer) => React.ReactNode }) {
  const [buf, setBuf] = useState<ArrayBuffer | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(downloadUrl(item.path), { signal: ctrl.signal })
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then(setBuf)
      .catch((e: unknown) => !(e instanceof DOMException && e.name === 'AbortError') && setFailed(true))
    return () => ctrl.abort()
  }, [item.path])
  if (failed) return <NoPreview item={item} text="The file couldn’t be loaded." />
  if (!buf) return <ViewerMessage text="Opening…" />
  return <ViewerErrorBoundary item={item}>{render(buf)}</ViewerErrorBoundary>
}

function TextView({ item, markdown }: { item: FileRow; markdown: boolean }) {
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(downloadUrl(item.path), { signal: ctrl.signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(setText)
      .catch((e: unknown) => !(e instanceof DOMException && e.name === 'AbortError') && setFailed(true))
    return () => ctrl.abort()
  }, [item.path])
  const html = useMarkdownHtml(markdown && text ? text : '')
  if (failed) return <NoPreview item={item} text="The file couldn’t be loaded." />
  if (text === null) return <ViewerMessage text="Opening…" />
  return (
    <div className="viewer-doc">
      {markdown ? <div className="prose viewer-prose" dangerouslySetInnerHTML={{ __html: html }} /> : <pre className="viewer-text">{text}</pre>}
    </div>
  )
}

export function ViewerMessage({ text }: { text: string }) {
  return <div className="viewer-message">{text}</div>
}

function NoPreview({ item, text }: { item: FileRow; text: string }) {
  return (
    <div className="viewer-none">
      <FileIcon item={item} size={96} />
      <strong>{item.name}</strong>
      <p>{text}</p>
      <a className="btn btn-primary" href={downloadUrl(item.path)}>
        <Icon name="download" /> Download
      </a>
    </div>
  )
}


/** A file the readers choke on shows "can't preview" instead of breaking the page. */
class ViewerErrorBoundary extends Component<{ item: FileRow; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <NoPreview item={this.props.item} text="This file couldn’t be previewed." /> : this.props.children
  }
}
