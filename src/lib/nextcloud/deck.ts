import 'server-only'
import type { Session } from '../session'
import { ncJson, ncRequest, ocs } from './http'

const BASE = '/index.php/apps/deck/api/v1.0'
const APP = 'Deck'

export type DeckUser = { primaryKey: string; uid: string; displayname: string; type: number }
export type DeckLabel = { id: number; title: string; color: string; boardId?: number }
export type DeckAssignment = { id: number; participant: DeckUser; cardId: number; type: number }

export type DeckCard = {
  id: number
  title: string
  description: string
  stackId: number
  type: string
  lastModified: number
  createdAt: number
  labels: DeckLabel[]
  assignedUsers: DeckAssignment[]
  attachmentCount: number | null
  owner: DeckUser | string
  order: number
  archived: boolean
  done: string | null
  duedate: string | null
  deletedAt: number
  commentsCount: number
}

export type DeckStack = { id: number; title: string; boardId: number; order: number; deletedAt: number; cards?: DeckCard[] }

export type DeckPermissions = {
  PERMISSION_READ: boolean
  PERMISSION_EDIT: boolean
  PERMISSION_MANAGE: boolean
  PERMISSION_SHARE: boolean
}

export type DeckBoard = {
  id: number
  title: string
  owner: DeckUser
  color: string
  archived: boolean
  labels: DeckLabel[]
  users: DeckUser[]
  permissions: DeckPermissions
  /** Who the board is shared with (only present on GET /boards/{id}). */
  acl?: DeckAcl[]
  deletedAt: number
  lastModified: number
}

/** Deck share types: 0 = user, 1 = group, 7 = team (circle). */
export type DeckAclType = 0 | 1 | 7

export type DeckAcl = {
  id: number
  type: DeckAclType
  participant: { primaryKey: string; uid?: string; displayname: string; type: number }
  permissionEdit: boolean
  permissionShare: boolean
  permissionManage: boolean
  owner: boolean
}

export type AclPermissions = Pick<DeckAcl, 'permissionEdit' | 'permissionShare' | 'permissionManage'>

export type DeckComment = {
  id: number
  objectId: number
  message: string
  actorId: string
  actorType: string
  actorDisplayName: string
  creationDateTime: string
}

const deck = <T>(s: Session, path: string, method = 'GET', body?: unknown) =>
  ncJson<T>(s, BASE + path, { method, body, app: APP })

export async function listBoards(s: Session): Promise<DeckBoard[]> {
  const boards = await deck<DeckBoard[]>(s, '/boards?details=true')
  return boards.filter((b) => !b.deletedAt).sort((a, b) => a.title.localeCompare(b.title))
}

export const getBoard = (s: Session, boardId: number) => deck<DeckBoard>(s, `/boards/${boardId}`)

export async function getStacks(s: Session, boardId: number): Promise<DeckStack[]> {
  const stacks = await deck<DeckStack[]>(s, `/boards/${boardId}/stacks`)
  return stacks
    .filter((st) => !st.deletedAt)
    .sort((a, b) => a.order - b.order || a.id - b.id)
    .map((st) => ({
      ...st,
      cards: (st.cards ?? []).filter((c) => !c.archived && !c.deletedAt).sort((a, b) => a.order - b.order || a.id - b.id),
    }))
}

export const createBoard = (s: Session, title: string, color: string) => deck<DeckBoard>(s, '/boards', 'POST', { title, color })
export const updateBoard = (s: Session, boardId: number, title: string, color: string, archived = false) =>
  deck<DeckBoard>(s, `/boards/${boardId}`, 'PUT', { title, color, archived })

export const createStack = (s: Session, boardId: number, title: string, order: number) =>
  deck<DeckStack>(s, `/boards/${boardId}/stacks`, 'POST', { title, order })
export const updateStack = (s: Session, boardId: number, stackId: number, title: string, order: number) =>
  deck<DeckStack>(s, `/boards/${boardId}/stacks/${stackId}`, 'PUT', { title, order })
export const deleteStack = (s: Session, boardId: number, stackId: number) =>
  deck<unknown>(s, `/boards/${boardId}/stacks/${stackId}`, 'DELETE')

const cardPath = (boardId: number, stackId: number, cardId?: number) =>
  `/boards/${boardId}/stacks/${stackId}/cards${cardId ? `/${cardId}` : ''}`

export const getCard = (s: Session, boardId: number, stackId: number, cardId: number) =>
  deck<DeckCard>(s, cardPath(boardId, stackId, cardId))

export const createCard = (
  s: Session,
  boardId: number,
  stackId: number,
  data: { title: string; description?: string; duedate?: string | null; order?: number },
) => deck<DeckCard>(s, cardPath(boardId, stackId), 'POST', { type: 'plain', order: 999, ...data })

export type CardPatch = Partial<Pick<DeckCard, 'title' | 'description' | 'duedate' | 'done'>>

/** Deck's update endpoint wants the whole card, so read-modify-write. */
export async function updateCard(s: Session, boardId: number, stackId: number, cardId: number, patch: CardPatch) {
  const card = await getCard(s, boardId, stackId, cardId)
  const owner = typeof card.owner === 'string' ? card.owner : card.owner.uid
  return deck<DeckCard>(s, cardPath(boardId, stackId, cardId), 'PUT', {
    title: card.title,
    type: card.type,
    owner,
    description: card.description ?? '',
    order: card.order,
    duedate: card.duedate,
    ...('done' in patch ? {} : { done: card.done }),
    ...patch,
  })
}

export const moveCard = (s: Session, boardId: number, stackId: number, cardId: number, toStackId: number, order: number) =>
  deck<DeckCard[]>(s, cardPath(boardId, stackId, cardId) + '/reorder', 'PUT', { stackId: toStackId, order })

export const deleteCard = (s: Session, boardId: number, stackId: number, cardId: number) =>
  deck<unknown>(s, cardPath(boardId, stackId, cardId), 'DELETE')
export const archiveCard = (s: Session, boardId: number, stackId: number, cardId: number) =>
  deck<unknown>(s, cardPath(boardId, stackId, cardId) + '/archive', 'PUT')

export const assignLabel = (s: Session, boardId: number, stackId: number, cardId: number, labelId: number, on: boolean) =>
  deck<unknown>(s, cardPath(boardId, stackId, cardId) + (on ? '/assignLabel' : '/removeLabel'), 'PUT', { labelId })
export const assignUser = (s: Session, boardId: number, stackId: number, cardId: number, userId: string, on: boolean) =>
  deck<unknown>(s, cardPath(boardId, stackId, cardId) + (on ? '/assignUser' : '/unassignUser'), 'PUT', { userId })

export const createLabel = (s: Session, boardId: number, title: string, color: string) =>
  deck<DeckLabel>(s, `/boards/${boardId}/labels`, 'POST', { title, color })

export const listComments = (s: Session, cardId: number) =>
  ocs<DeckComment[]>(s, `/apps/deck/api/v1.0/cards/${cardId}/comments?limit=200`, { app: APP })
export const addComment = (s: Session, cardId: number, message: string) =>
  ocs<DeckComment>(s, `/apps/deck/api/v1.0/cards/${cardId}/comments`, { method: 'POST', body: { message }, app: APP })
export const deleteComment = (s: Session, cardId: number, commentId: number) =>
  ocs<unknown>(s, `/apps/deck/api/v1.0/cards/${cardId}/comments/${commentId}`, { method: 'DELETE', app: APP })

export const deleteLabel = (s: Session, boardId: number, labelId: number) =>
  deck<unknown>(s, `/boards/${boardId}/labels/${labelId}`, 'DELETE')

// ---- Attachments (API v1.1: "file" attachments live in the uploader's Deck folder, shared with the board) ----

const BASE11 = '/index.php/apps/deck/api/v1.1'

export type DeckAttachment = {
  id: number
  cardId: number
  type: string
  data: string
  createdAt: number
  createdBy: string
  deletedAt: number
  extendedData: {
    filesize?: number
    mimetype?: string
    fileid?: number
    hasPreview?: boolean
    info?: { basename?: string; extension?: string }
    attachmentCreator?: { displayName?: string; id?: string }
  }
}

const attachmentsPath = (boardId: number, stackId: number, cardId: number) => `${BASE11}${cardPath(boardId, stackId, cardId)}/attachments`

export async function listAttachments(s: Session, boardId: number, stackId: number, cardId: number): Promise<DeckAttachment[]> {
  const all = await ncJson<DeckAttachment[]>(s, attachmentsPath(boardId, stackId, cardId), { app: APP })
  return all.filter((a) => !a.deletedAt).sort((a, b) => b.createdAt - a.createdAt)
}

export async function uploadAttachment(s: Session, boardId: number, stackId: number, cardId: number, file: File): Promise<DeckAttachment> {
  const form = new FormData()
  form.set('type', 'file')
  // Some Deck releases (Nextcloud 33/34) declare `data` as a required string and answer a
  // bare 400 without it. Deck replaces it with the stored file name, so the name is fine.
  form.set('data', file.name)
  form.set('file', file, file.name)
  return ncJson<DeckAttachment>(s, attachmentsPath(boardId, stackId, cardId), { method: 'POST', raw: form, app: APP })
}

const attachmentPath = (boardId: number, stackId: number, cardId: number, type: string, attachmentId: number) =>
  `${attachmentsPath(boardId, stackId, cardId)}/${encodeURIComponent(type)}/${attachmentId}`

export const deleteAttachment = (s: Session, boardId: number, stackId: number, cardId: number, type: string, attachmentId: number) =>
  ncJson<unknown>(s, attachmentPath(boardId, stackId, cardId, type, attachmentId), { method: 'DELETE', app: APP })

/** The attachment's bytes (a fetch Response, for streaming to the browser). */
export const fetchAttachment = (s: Session, boardId: number, stackId: number, cardId: number, type: string, attachmentId: number) =>
  ncRequest(s, attachmentPath(boardId, stackId, cardId, type, attachmentId), { headers: { Accept: '*/*' } })

// ---- Sharing (who can see / edit / manage a board) ----

export const addAcl = (s: Session, boardId: number, type: DeckAclType, participant: string, perms: AclPermissions) =>
  deck<DeckAcl>(s, `/boards/${boardId}/acl`, 'POST', { type, participant, ...perms })

export const updateAcl = (s: Session, boardId: number, aclId: number, perms: AclPermissions) =>
  deck<DeckAcl>(s, `/boards/${boardId}/acl/${aclId}`, 'PUT', perms)

export const deleteAcl = (s: Session, boardId: number, aclId: number) => deck<unknown>(s, `/boards/${boardId}/acl/${aclId}`, 'DELETE')
