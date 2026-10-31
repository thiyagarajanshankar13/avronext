'use client'
import { useEffect, useState } from 'react'
import { loadShares } from '@/app/(app)/files/actions'
import type { FileRow } from '@/app/(app)/files/data'
import type { Share } from '@/lib/nextcloud/files'
import { fmtDateTime } from '@/lib/format'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import { FileIcon, TypeGlyph } from './FileIcon'
import { can, extOf, fileKind, fmtSize, parentOf } from './paths'

const KIND_LABEL: Record<string, string> = {
  folder: 'Folder',
  image: 'Image',
  pdf: 'PDF document',
  video: 'Video',
  audio: 'Audio',
  markdown: 'Markdown',
  text: 'Text',
  word: 'Word document',
  sheet: 'Spreadsheet',
  slides: 'Presentation',
  archive: 'Archive',
}

/** The "i" pane: the selected item (or the open folder) and who has access. */
export function DetailsPane({
  item,
  count,
  folder,
  onClose,
  onShare,
}: {
  item: FileRow | null
  count: number
  folder: { path: string; name: string; permissions: string } | null
  onClose: () => void
  onShare: (item: FileRow) => void
}) {
  const [shares, setShares] = useState<Share[] | null>(null)
  const sharePath = item && (item.shareTypes.length > 0 || can.share(item.permissions)) ? item.path : null

  useEffect(() => {
    setShares(null)
    if (!sharePath) return
    let live = true
    loadShares(sharePath).then((r) => live && r.ok && setShares(r.data))
    return () => {
      live = false
    }
  }, [sharePath, item?.shareTypes.length])

  return (
    <aside className="files-details" aria-label="Details">
      <div className="files-details-head">
        <strong>{item ? item.name : count > 1 ? `${count} items selected` : folder ? folder.name || 'My files' : 'Details'}</strong>
        <button className="icon-btn icon-btn-sm" aria-label="Close details" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {item ? (
        <>
          <div className="files-details-preview">
            <FileIcon item={item} size={item.hasPreview ? 240 : 96} thumb={512} />
          </div>
          {can.share(item.permissions) && (
            <button className="btn btn-default btn-block" onClick={() => onShare(item)}>
              <Icon name="share" /> Manage access
            </button>
          )}
          {shares && shares.length > 0 && (
            <div className="files-details-section">
              <h4>Has access</h4>
              <ul className="files-details-access">
                {shares.map((s) => (
                  <li key={s.id}>
                    {s.type === 3 ? (
                      <span className="share-link-icon">
                        <Icon name="link" size={14} />
                      </span>
                    ) : s.type === 0 ? (
                      <Avatar uid={s.shareWith} name={s.shareWithName} size={24} />
                    ) : (
                      <span className="share-link-icon">
                        <Icon name="group" size={14} />
                      </span>
                    )}
                    <span>{s.type === 3 ? s.label || 'Anyone with the link' : s.shareWithName}</span>
                    <small className="muted">{s.permissions & 2 ? 'Can edit' : 'Can view'}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <dl className="files-details-props">
            <dt>Type</dt>
            <dd>{KIND_LABEL[fileKind(item)] ?? (extOf(item.name) ? `${extOf(item.name).toUpperCase()} file` : 'File')}</dd>
            {(!item.isDir || item.size > 0) && (
              <>
                <dt>Size</dt>
                <dd>{fmtSize(item.size)}</dd>
              </>
            )}
            <dt>Modified</dt>
            <dd>{fmtDateTime(item.mtime)}</dd>
            {item.sharedBy && (
              <>
                <dt>Shared by</dt>
                <dd>{item.sharedBy}</dd>
              </>
            )}
            {item.ownerName && item.owner && !item.sharedBy && item.permissions.includes('S') && (
              <>
                <dt>Owner</dt>
                <dd>{item.ownerName}</dd>
              </>
            )}
            <dt>Location</dt>
            <dd>{parentOf(item.path) === '/' ? 'My files' : `My files${parentOf(item.path)}`}</dd>
          </dl>
        </>
      ) : (
        <div className="files-details-empty">
          <TypeGlyph kind="folder" size={64} />
          <p className="muted small">{count > 1 ? 'Select a single item to see its details.' : 'Select a file or folder to see its details and who has access.'}</p>
        </div>
      )}
    </aside>
  )
}
