import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Avatar } from '@/components/Avatar'
import { PageArticle } from '@/components/space/PageArticle'
import { PageEditor } from '@/components/space/PageEditor'
import { PageToolbar } from '@/components/space/PageToolbar'
import { nextcloudPublicUrl } from '@/lib/env'
import { fmtDate } from '@/lib/format'
import { loadSpace, loadSpacePages } from '@/lib/loaders'
import { markdownToSafeHtml } from '@/lib/markdown.server'
import { attachmentsDir, listPageAttachments, pageDir, readPageContent } from '@/lib/nextcloud/collectives'
import { loadOrSignOut, NextcloudAuthError } from '@/lib/nextcloud/http'
import { ancestors, toLite } from '@/lib/pageTree'
import { collectiveLinkOptions } from '@/lib/pageLinks'
import { requireSession } from '@/lib/session'

/**
 * A space page (view or editor). `pageId` null = the space's landing page.
 * The page's metadata comes from the (shared, cached) page list, so the only
 * extra Nextcloud round trip is reading the Markdown file.
 */
export async function PageScreen({ cid, pageId, edit }: { cid: number; pageId: number | null; edit: boolean }) {
  const session = await requireSession()
  const [space, pages] = await Promise.all([loadSpace(cid), loadSpacePages(cid)])
  const page = pageId === null ? pages.find((p) => p.parentId === 0) : pages.find((p) => p.id === pageId)
  if (!page) notFound()
  // Body and attachment list in parallel (the editor doesn't show the list).
  const [{ markdown, etag }, attachments] = await loadOrSignOut(() =>
    Promise.all([
      readPageContent(session, page),
      edit
        ? Promise.resolve([])
        : listPageAttachments(session, cid, page.id).catch((err) => {
            if (err instanceof NextcloudAuthError) throw err
            return []
          }),
    ]),
  )
  const isRoot = page.parentId === 0
  const title = isRoot ? space.name : page.title
  const lite = pages.map(toLite)
  const crumbs = ancestors(lite, page.id)
  const pageIds = new Set(pages.map((p) => p.id))
  const linkOpts = collectiveLinkOptions(cid, pageDir(page), pageIds)

  if (edit && space.canEdit) {
    return (
      <PageEditor
        spaceId={cid}
        pageId={page.id}
        initialTitle={title}
        initialMarkdown={markdown}
        etag={etag}
        isRoot={isRoot}
        pageDir={pageDir(page)}
        pageIds={[...pageIds]}
      />
    )
  }

  const { html, headings } = markdownToSafeHtml(markdown, linkOpts)
  const children = findChildren(lite, page.id)
  const ncHref = `${nextcloudPublicUrl()}/apps/collectives/${encodeURIComponent(space.slug ? `${space.slug}-${space.id}` : space.name)}${
    isRoot ? '' : `/${encodeURIComponent(page.slug ? `${page.slug}-${page.id}` : page.title)}`
  }`

  return (
    <div className="page-view">
      <div className="page-view-top">
        <div className="breadcrumbs">
          <Link prefetch={false} href="/spaces">Spaces</Link>
          <span className="sep">/</span>
          <Link prefetch={false} href={`/spaces/${cid}`}>{space.name}</Link>
          {crumbs
            .filter((c) => c.parentId !== 0)
            .map((c) => (
              <span key={c.id} className="crumb">
                <span className="sep">/</span>
                <Link prefetch={false} href={`/spaces/${cid}/pages/${c.id}`}>{c.title}</Link>
              </span>
            ))}
        </div>
        <PageToolbar spaceId={cid} pageId={page.id} title={title} emoji={page.emoji} isRoot={isRoot} canEdit={space.canEdit} nextcloudHref={ncHref} />
      </div>

      <div className={`page-layout${headings.length > 2 ? ' has-toc' : ''}`}>
        <PageArticle spaceId={cid} pageId={page.id} attachmentsDir={attachmentsDir(page)} initialAttachments={attachments} canEdit={space.canEdit}>
          <h1 className="page-title">
            {page.emoji && <span className="page-emoji">{page.emoji}</span>}
            {title}
          </h1>
          <div className="byline">
            {page.lastUserId && <Avatar uid={page.lastUserId} name={page.lastUserDisplayName ?? page.lastUserId} size={24} />}
            <span>
              {page.lastUserDisplayName ? <>Last updated by <strong>{page.lastUserDisplayName}</strong> · </> : null}
              {fmtDate(page.timestamp)}
            </span>
          </div>
          {markdown.trim() ? (
            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="page-empty muted">
              This page is empty.{' '}
              {space.canEdit && (
                <Link prefetch={false} href={`/spaces/${cid}/pages/${page.id}/edit`} className="link">
                  Start writing
                </Link>
              )}
            </div>
          )}
          {children.length > 0 && (
            <section className="child-pages">
              <h2>Child pages</h2>
              <ul>
                {children.map((c) => (
                  <li key={c.id}>
                    <Link prefetch={false} href={`/spaces/${cid}/pages/${c.id}`}>
                      <span className="child-icon">{c.emoji || '📄'}</span> {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </PageArticle>
        {headings.length > 2 && (
          <nav className="page-toc" aria-label="On this page">
            <div className="toc-label">On this page</div>
            <ul>
              {headings.map((h) => (
                <li key={h.id} className={`toc-l${h.level}`}>
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  )
}

function findChildren(pages: ReturnType<typeof toLite>[], id: number) {
  const parent = pages.find((p) => p.id === id)
  const order = new Map((parent?.subpageOrder ?? []).map((pid, i) => [pid, i]))
  return pages
    .filter((p) => p.parentId === id)
    .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.title.localeCompare(b.title))
}
