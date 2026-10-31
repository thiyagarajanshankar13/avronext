'use client'
import { useRef, useState } from 'react'
import type { PageAttachment } from '@/lib/nextcloud/collectives'
import { Attachments, type AttachmentItem, useUploadQueue } from '../attachments/Attachments'
import { deleteRequest, isImageName, uploadWithProgress } from '../attachments/upload'
import { useFileDrop } from '../attachments/useFileDrop'
import { Icon } from '../Icon'

/**
 * The page body (rendered on the server and passed in as children) plus the
 * page's attachments. Files dropped anywhere on the page are attached to it.
 */
export function PageArticle({
  spaceId,
  pageId,
  attachmentsDir,
  initialAttachments,
  canEdit,
  children,
}: {
  spaceId: number
  pageId: number
  /** User-relative folder of the attachments, e.g. "Collectives/Space/Page/.attachments.12". */
  attachmentsDir: string
  initialAttachments: PageAttachment[]
  canEdit: boolean
  children: React.ReactNode
}) {
  const [list, setList] = useState(initialAttachments)
  const ref = useRef<HTMLElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const endpoint = `/api/attachments/page/${spaceId}/${pageId}`

  const queue = useUploadQueue(async (file, onProgress) => {
    const r = await uploadWithProgress<{ name: string }>(endpoint, file, onProgress)
    const added: PageAttachment = {
      id: 0,
      name: r.name,
      filesize: file.size,
      mimetype: file.type,
      timestamp: Math.floor(Date.now() / 1000),
      path: `/${attachmentsDir}/${r.name}`,
      hasPreview: false,
    }
    setList((all) => [added, ...all])
  })
  const dragging = useFileDrop(ref, queue.add, canEdit)

  const fileUrl = (a: PageAttachment) => `/api/files?path=${encodeURIComponent(a.path.replace(/^\/+/, ''))}`
  const items: AttachmentItem[] = list.map((a) => ({
    key: a.path,
    name: a.name,
    size: a.filesize,
    date: a.timestamp,
    href: fileUrl(a),
    downloadHref: `${fileUrl(a)}&download`,
    thumb: a.id && a.hasPreview ? `/api/preview/${a.id}?size=256` : isImageName(a.name) ? fileUrl(a) : null,
    canDelete: canEdit,
  }))

  return (
    <article ref={ref} className="page-article">
      {dragging && (
        <div className="drop-overlay">
          <Icon name="paperclip" size={28} />
          Drop files to attach them to this page
        </div>
      )}
      {children}
      <section className="page-attachments">
        <div className="section-row">
          <h2>
            Attachments{list.length ? <span className="count-pill">{list.length}</span> : null}
          </h2>
          {canEdit && (
            <button className="btn btn-default btn-sm" onClick={() => input.current?.click()}>
              <Icon name="paperclip" /> Attach files
            </button>
          )}
        </div>
        <Attachments
          items={items}
          canUpload={canEdit}
          queue={queue}
          inputRef={input}
          remove={async (item) => {
            const a = list.find((x) => x.path === item.key)
            if (!a) return
            await deleteRequest(`${endpoint}?name=${encodeURIComponent(a.name)}`)
            setList((all) => all.filter((x) => x !== a))
          }}
        />
      </section>
    </article>
  )
}
