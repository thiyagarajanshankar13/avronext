'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { createPage, setPageEmoji, trashPage } from '@/app/(app)/spaces/actions'
import { useGoFresh } from '@/lib/useGoFresh'
import { Icon } from '../Icon'
import { Menu } from '../Menu'

const EMOJIS = ['📄', '📘', '📝', '📌', '✅', '🚀', '💡', '📣', '📊', '🧭', '🎯', '🛠️', '🧪', '🔒', '🗓️', '🤝', '⭐', '❓']

export function PageToolbar({
  spaceId,
  pageId,
  title,
  emoji,
  isRoot,
  canEdit,
  nextcloudHref,
}: {
  spaceId: number
  pageId: number
  title: string
  emoji: string | null
  isRoot: boolean
  canEdit: boolean
  nextcloudHref: string
}) {
  const goFresh = useGoFresh()
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, then?: () => void) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) return alert(r.error)
      then?.()
    })

  return (
    <div className="page-toolbar">
      {canEdit && (
        <Link prefetch={false} className="btn btn-default" href={`/spaces/${spaceId}/pages/${pageId}/edit`}>
          <Icon name="edit" /> Edit
        </Link>
      )}
      {canEdit && (
        <button
          className="btn btn-subtle"
          disabled={pending}
          title="Create a child page"
          onClick={() =>
            start(async () => {
              const r = await createPage(spaceId, pageId, 'Untitled page')
              if (!r.ok) return alert(r.error)
              goFresh(`/spaces/${spaceId}/pages/${r.data.id}/edit`)
            })
          }
        >
          <Icon name="plus" /> <span className="hide-sm">Child page</span>
        </button>
      )}
      <button
        className="icon-btn"
        title={copied ? 'Copied' : 'Copy link'}
        onClick={() => {
          navigator.clipboard?.writeText(location.href.split('?')[0])
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        <Icon name={copied ? 'check' : 'link'} />
      </button>
      <Menu align="right" label="More actions" trigger={<span className="icon-btn"><Icon name="more" /></span>}>
        {(close) => (
          <>
            {canEdit && !isRoot && (
              <>
                <div className="menu-heading">Page icon</div>
                <div className="emoji-grid emoji-grid-menu">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      className={`emoji-btn${emoji === e ? ' is-selected' : ''}`}
                      onClick={() => {
                        close()
                        act(() => setPageEmoji(spaceId, pageId, e))
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                {emoji && (
                  <button
                    className="menu-item"
                    onClick={() => {
                      close()
                      act(() => setPageEmoji(spaceId, pageId, null))
                    }}
                  >
                    Remove icon
                  </button>
                )}
                <div className="menu-sep" />
              </>
            )}
            <a className="menu-item" href={nextcloudHref} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> Open in Collectives
            </a>
            {canEdit && !isRoot && (
              <button
                className="menu-item menu-item-danger"
                onClick={() => {
                  close()
                  if (!confirm(`Move “${title}” and its child pages to the trash? You can restore it in Nextcloud Collectives.`)) return
                  act(
                    () => trashPage(spaceId, pageId),
                    () => goFresh(`/spaces/${spaceId}`),
                  )
                }}
              >
                <Icon name="trash" /> Move to trash
              </button>
            )}
          </>
        )}
      </Menu>
    </div>
  )
}
