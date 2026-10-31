import 'server-only'
import type { Session } from '../session'
import { davPath, ncRequest, NextcloudError, ocs } from './http'

const BASE = '/apps/collectives/api/v1.0'
const APP = 'Collectives'

export type Collective = {
  id: number
  slug?: string
  name: string
  emoji: string | null
  trashTimestamp: number | null
  /** The user's level in the collective's team: 1 member, 4 moderator, 8 admin, 9 owner. */
  level: number
  /** Minimum level needed to edit pages / to share. */
  editPermissionLevel?: number
  sharePermissionLevel?: number
  /** The Nextcloud team (circle) that holds the members. */
  circleId?: string
  canEdit: boolean
  canShare: boolean
}

export type Page = {
  id: number
  slug?: string
  title: string
  emoji: string | null
  lastUserId: string | null
  lastUserDisplayName: string | null
  timestamp: number
  size: number
  fileName: string
  filePath: string
  collectivePath: string
  parentId: number
  subpageOrder: number[]
  trashTimestamp: number | null
}

const call = <T>(s: Session, path: string, method = 'GET', body?: unknown) => ocs<T>(s, BASE + path, { method, body, app: APP })

export async function listCollectives(s: Session): Promise<Collective[]> {
  const { collectives } = await call<{ collectives: Collective[] }>(s, '/collectives')
  return collectives.filter((c) => !c.trashTimestamp).sort((a, b) => a.name.localeCompare(b.name))
}

export async function createCollective(s: Session, name: string, emoji: string | null) {
  const { collective } = await call<{ collective: Collective }>(s, '/collectives', 'POST', { name, emoji })
  return collective
}

export async function listPages(s: Session, collectiveId: number): Promise<Page[]> {
  const { pages } = await call<{ pages: Page[] }>(s, `/collectives/${collectiveId}/pages`)
  return pages.filter((p) => !p.trashTimestamp)
}

export async function getPage(s: Session, collectiveId: number, pageId: number): Promise<Page> {
  const { page } = await call<{ page: Page }>(s, `/collectives/${collectiveId}/pages/${pageId}`)
  return page
}

export async function createPage(s: Session, collectiveId: number, parentId: number, title: string) {
  const { page } = await call<{ page: Page }>(s, `/collectives/${collectiveId}/pages/${parentId}`, 'POST', { title })
  return page
}

/** Rename and/or move (parentId) a page. */
export async function movePage(s: Session, collectiveId: number, pageId: number, data: { title?: string; parentId?: number; index?: number }) {
  const { page } = await call<{ page: Page }>(s, `/collectives/${collectiveId}/pages/${pageId}`, 'PUT', data)
  return page
}

export async function setPageEmoji(s: Session, collectiveId: number, pageId: number, emoji: string | null) {
  const { page } = await call<{ page: Page }>(s, `/collectives/${collectiveId}/pages/${pageId}/emoji`, 'PUT', { emoji })
  return page
}

export const trashPage = (s: Session, collectiveId: number, pageId: number) =>
  call<unknown>(s, `/collectives/${collectiveId}/pages/${pageId}`, 'DELETE')

export const touchPage = (s: Session, collectiveId: number, pageId: number) =>
  call<unknown>(s, `/collectives/${collectiveId}/pages/${pageId}/touch`)

export async function searchPages(s: Session, collectiveId: number, q: string): Promise<Page[]> {
  const { pages } = await call<{ pages: Page[] }>(s, `/collectives/${collectiveId}/search?searchString=${encodeURIComponent(q)}`)
  return pages
}

/** Path of the page's Markdown file inside the user's files. */
export function pageFile(page: Page): string {
  return [page.collectivePath, page.filePath, page.fileName].filter(Boolean).join('/')
}

/** Directory the page's relative links/images resolve against. */
export function pageDir(page: Page): string {
  return [page.collectivePath, page.filePath].filter(Boolean).join('/')
}

export async function readPageContent(s: Session, page: Page): Promise<{ markdown: string; etag: string | null }> {
  const path = davPath(s.userId, pageFile(page))
  const res = await ncRequest(s, path, { headers: { Accept: '*/*' } })
  if (res.status === 404) return { markdown: '', etag: null }
  if (!res.ok) throw new NextcloudError(`Could not read page (${res.status})`, res.status, path)
  return { markdown: await res.text(), etag: res.headers.get('etag') }
}

/** Writes the page's Markdown. With `ifMatch`, Nextcloud answers 412 if the file changed meanwhile. */
export async function writePageContent(s: Session, page: Page, markdown: string, ifMatch: string | null): Promise<void> {
  const path = davPath(s.userId, pageFile(page))
  const headers: Record<string, string> = { 'Content-Type': 'text/markdown; charset=utf-8' }
  if (ifMatch) headers['If-Match'] = ifMatch
  const res = await ncRequest(s, path, { method: 'PUT', raw: markdown, headers })
  if (!res.ok) throw new NextcloudError(`Could not save page (${res.status})`, res.status, path)
}

// ---- Page attachments: files in `.attachments.<pageId>/` next to the page's Markdown file
// (the folder Nextcloud Text uses, so they show up in Collectives too). ----

export type PageAttachment = {
  id: number
  name: string
  filesize: number
  mimetype: string
  timestamp: number
  /** Path in the user's files, e.g. "/Collectives/Space/Page/.attachments.12/a.png". */
  path: string
  hasPreview: boolean
}

export const attachmentsDirName = (page: Page) => `.attachments.${page.id}`
export const attachmentsDir = (page: Page) => `${pageDir(page)}/${attachmentsDirName(page)}`

export async function listPageAttachments(s: Session, collectiveId: number, pageId: number): Promise<PageAttachment[]> {
  const { attachments } = await call<{ attachments: PageAttachment[] }>(s, `/collectives/${collectiveId}/pages/${pageId}/attachments`)
  return attachments.sort((a, b) => b.timestamp - a.timestamp)
}

function withSuffix(name: string, n: number) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`
}

/**
 * Stores a file in the page's attachments folder and returns the name it got:
 * an existing file is never overwritten ("a.png" → "a (2).png").
 */
export async function uploadPageAttachment(s: Session, page: Page, name: string, body: Blob): Promise<string> {
  const dir = attachmentsDir(page)
  const mk = await ncRequest(s, davPath(s.userId, dir), { method: 'MKCOL' })
  if (!mk.ok && mk.status !== 405) throw new NextcloudError(`Could not create the attachments folder (${mk.status})`, mk.status, dir)
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? name : withSuffix(name, n)
    const res = await ncRequest(s, davPath(s.userId, dir, candidate), {
      method: 'PUT',
      raw: body,
      headers: { 'If-None-Match': '*', 'Content-Type': body.type || 'application/octet-stream' },
    })
    if (res.ok) return candidate
    if (res.status !== 412) throw new NextcloudError(`Could not upload ${name} (${res.status})`, res.status, dir)
  }
  throw new NextcloudError(`Could not find a free name for ${name}`, 409, dir)
}

export async function deletePageAttachment(s: Session, page: Page, name: string): Promise<void> {
  const res = await ncRequest(s, davPath(s.userId, attachmentsDir(page), name), { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new NextcloudError(`Could not delete ${name} (${res.status})`, res.status, name)
}

// ---- Space settings ----

/** Minimum team level that may edit pages / share: 1 members, 4 moderators, 8 admins. */
export async function setPermissionLevel(s: Session, collectiveId: number, which: 'edit' | 'share', level: number) {
  const { collective } = await call<{ collective: Collective }>(s, `/collectives/${collectiveId}/${which}Level`, 'PUT', { level })
  return collective
}

export async function setCollectiveEmoji(s: Session, collectiveId: number, emoji: string | null) {
  const { collective } = await call<{ collective: Collective }>(s, `/collectives/${collectiveId}`, 'PUT', { emoji })
  return collective
}

/** Moves the collective to the Collectives trash (restorable in Nextcloud). */
export const trashCollective = (s: Session, collectiveId: number) => call<unknown>(s, `/collectives/${collectiveId}`, 'DELETE')
