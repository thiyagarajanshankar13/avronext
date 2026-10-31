'use client'
import { useEffect, useState } from 'react'
import { loadAttachments } from '@/app/(app)/projects/actions'
import type { DeckAttachment, DeckBoard } from '@/lib/nextcloud/deck'
import { Attachments, type AttachmentItem, type UploadQueue } from '../attachments/Attachments'
import { deleteRequest, isImageName } from '../attachments/upload'

/** Card attachments (Deck "file" attachments) for the issue panel. */
export function IssueAttachments({
  board,
  stackId,
  cardId,
  me,
  canEdit,
  list,
  setList,
  queue,
  inputRef,
  onCount,
}: {
  board: DeckBoard
  stackId: number
  cardId: number
  me: string
  canEdit: boolean
  list: DeckAttachment[] | null
  setList: (fn: (all: DeckAttachment[] | null) => DeckAttachment[] | null) => void
  queue: UploadQueue
  inputRef: React.RefObject<HTMLInputElement | null>
  onCount: (delta: number) => void
}) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setList(() => null)
    loadAttachments(board.id, stackId, cardId).then((r) => {
      if (!live) return
      if (r.ok) setList(() => r.data)
      else setError(r.error)
    })
    return () => {
      live = false
    }
    // Reload when switching issues, not when the issue moves column.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id, cardId])

  const base = (a: DeckAttachment) => `/api/attachments/card/${cardId}/${a.type}/${a.id}?board=${board.id}&stack=${stackId}&name=${encodeURIComponent(a.data)}`
  const items: AttachmentItem[] = (list ?? []).map((a) => ({
    key: `${a.type}-${a.id}`,
    name: a.data,
    size: a.extendedData.filesize,
    date: a.createdAt,
    by: a.extendedData.attachmentCreator?.displayName ?? a.createdBy,
    href: base(a),
    downloadHref: `${base(a)}&download`,
    thumb: a.extendedData.fileid && (a.extendedData.hasPreview || isImageName(a.data)) ? `/api/preview/${a.extendedData.fileid}?size=256` : isImageName(a.data) ? base(a) : null,
    canDelete: canEdit && (a.createdBy === me || board.permissions.PERMISSION_MANAGE),
  }))

  return (
    <Attachments
      items={items}
      canUpload={canEdit}
      queue={queue}
      inputRef={inputRef}
      loading={list === null && !error}
      error={error}
      remove={async (item) => {
        const a = list?.find((x) => `${x.type}-${x.id}` === item.key)
        if (!a) return
        await deleteRequest(`/api/attachments/card/${cardId}/${a.type}/${a.id}?board=${board.id}&stack=${stackId}`)
        setList((all) => all?.filter((x) => x !== a) ?? null)
        onCount(-1)
      }}
    />
  )
}
