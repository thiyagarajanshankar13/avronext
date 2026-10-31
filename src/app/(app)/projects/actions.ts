'use server'

import { revalidatePath } from 'next/cache'
import { run } from '@/lib/actions'
import * as deck from '@/lib/nextcloud/deck'

const id = (n: unknown) => {
  const v = Number(n)
  if (!Number.isInteger(v) || v <= 0) throw new Error('Invalid id')
  return v
}
const text = (s: unknown, max = 255) => {
  const v = String(s ?? '').trim()
  if (!v) throw new Error('A title is required.')
  return v.slice(0, max)
}
const color = (c: unknown) => (/^[0-9a-f]{6}$/i.test(String(c)) ? String(c).toLowerCase() : '0c66e4')

export async function createProject(title: string, hex: string) {
  return run(async (s) => {
    const board = await deck.createBoard(s, text(title, 100), color(hex))
    // Boards made through the API start empty; give them the usual workflow.
    for (const [order, name] of ['To do', 'In progress', 'Done'].entries()) await deck.createStack(s, board.id, name, order)
    return { id: board.id }
  })
}

export async function updateProject(boardId: number, title: string, hex: string) {
  return run(async (s) => {
    await deck.updateBoard(s, id(boardId), text(title, 100), color(hex))
    revalidatePath('/', 'layout')
    return null
  })
}

export async function archiveProject(boardId: number) {
  return run(async (s) => {
    const board = await deck.getBoard(s, id(boardId))
    await deck.updateBoard(s, board.id, board.title, board.color, true)
    return null
  })
}

export async function loadStacks(boardId: number) {
  return run((s) => deck.getStacks(s, id(boardId)))
}

/**
 * Creates an issue, then adds `labelIds` (Deck can't set labels on create).
 * A label that can't be added doesn't undo the issue: it's left out of the
 * returned card and named in `labelsFailed`.
 */
export async function createIssue(boardId: number, stackId: number, title: string, description = '', duedate: string | null = null, labelIds: number[] = []) {
  return run(async (s) => {
    const card = await deck.createCard(s, id(boardId), id(stackId), { title: text(title), description, duedate })
    const board = labelIds.length ? await deck.getBoard(s, id(boardId)) : null
    const labels: deck.DeckLabel[] = []
    const labelsFailed: string[] = []
    for (const labelId of [...new Set(labelIds)].slice(0, 20)) {
      const label = board?.labels.find((l) => l.id === labelId)
      if (!label) continue
      try {
        await deck.assignLabel(s, id(boardId), id(stackId), card.id, label.id, true)
        labels.push(label)
      } catch {
        labelsFailed.push(label.title)
      }
    }
    return { ...card, labels: [...(card.labels ?? []), ...labels], labelsFailed }
  })
}

/** What the Create issue dialog needs for a project: its columns and labels. */
export async function loadIssueOptions(boardId: number) {
  return run(async (s) => {
    const [stacks, board] = await Promise.all([deck.getStacks(s, id(boardId)), deck.getBoard(s, id(boardId))])
    return { stacks: stacks.map(({ id, title }) => ({ id, title })), labels: board.labels }
  })
}

export async function updateIssue(boardId: number, stackId: number, cardId: number, patch: deck.CardPatch) {
  const clean: deck.CardPatch = {}
  if (patch.title !== undefined) clean.title = text(patch.title)
  if (patch.description !== undefined) clean.description = String(patch.description)
  if (patch.duedate !== undefined) clean.duedate = patch.duedate ? new Date(patch.duedate).toISOString() : null
  if (patch.done !== undefined) clean.done = patch.done ? new Date().toISOString() : null
  return run((s) => deck.updateCard(s, id(boardId), id(stackId), id(cardId), clean))
}

export async function moveIssue(boardId: number, stackId: number, cardId: number, toStackId: number, index: number) {
  return run(async (s) => {
    await deck.moveCard(s, id(boardId), id(stackId), id(cardId), id(toStackId), Math.max(0, Math.floor(index)))
    return null
  })
}

export async function setIssueLabel(boardId: number, stackId: number, cardId: number, labelId: number, on: boolean) {
  return run(async (s) => {
    await deck.assignLabel(s, id(boardId), id(stackId), id(cardId), id(labelId), on)
    return null
  })
}

export async function setIssueAssignee(boardId: number, stackId: number, cardId: number, userId: string, on: boolean) {
  return run(async (s) => {
    await deck.assignUser(s, id(boardId), id(stackId), id(cardId), text(userId), on)
    return null
  })
}

export async function deleteIssue(boardId: number, stackId: number, cardId: number) {
  return run(async (s) => {
    await deck.deleteCard(s, id(boardId), id(stackId), id(cardId))
    return null
  })
}

export async function archiveIssue(boardId: number, stackId: number, cardId: number) {
  return run(async (s) => {
    await deck.archiveCard(s, id(boardId), id(stackId), id(cardId))
    return null
  })
}

export async function loadAttachments(boardId: number, stackId: number, cardId: number) {
  return run((s) => deck.listAttachments(s, id(boardId), id(stackId), id(cardId)))
}

export async function loadComments(cardId: number) {
  return run(async (s) => {
    const comments = await deck.listComments(s, id(cardId))
    return comments.sort((a, b) => a.creationDateTime.localeCompare(b.creationDateTime))
  })
}

export async function addComment(cardId: number, message: string) {
  return run((s) => deck.addComment(s, id(cardId), text(message, 1000)))
}

export async function deleteComment(cardId: number, commentId: number) {
  return run(async (s) => {
    await deck.deleteComment(s, id(cardId), id(commentId))
    return null
  })
}

export async function createColumn(boardId: number, title: string, order: number) {
  return run(async (s) => {
    const stack = await deck.createStack(s, id(boardId), text(title, 100), order)
    revalidatePath(`/projects/${boardId}`, 'layout')
    return stack
  })
}

export async function updateColumn(boardId: number, stackId: number, title: string, order: number) {
  return run(async (s) => {
    const stack = await deck.updateStack(s, id(boardId), id(stackId), text(title, 100), order)
    revalidatePath(`/projects/${boardId}`, 'layout')
    return stack
  })
}

/**
 * Puts the board's columns in the given order. Deck stores a number per
 * column (new boards often have several with the same one), so every column
 * whose position changed gets 0, 1, 2… Columns missing from the list keep
 * their place after the listed ones.
 */
export async function reorderColumns(boardId: number, stackIds: number[]) {
  return run(async (s) => {
    const stacks = await deck.getStacks(s, id(boardId))
    const listed = stackIds.map(Number).filter((sid) => stacks.some((st) => st.id === sid))
    const ordered = [...listed, ...stacks.map((st) => st.id).filter((sid) => !listed.includes(sid))]
    for (const [order, sid] of ordered.entries()) {
      const st = stacks.find((x) => x.id === sid)!
      if (st.order !== order) await deck.updateStack(s, id(boardId), sid, st.title, order)
    }
    return null
  })
}

export async function deleteColumn(boardId: number, stackId: number) {
  return run(async (s) => {
    await deck.deleteStack(s, id(boardId), id(stackId))
    revalidatePath(`/projects/${boardId}`, 'layout')
    return null
  })
}

export async function createLabel(boardId: number, title: string, hex: string) {
  return run(async (s) => {
    const label = await deck.createLabel(s, id(boardId), text(title, 100), color(hex))
    revalidatePath(`/projects/${boardId}`, 'layout')
    return label
  })
}

export async function deleteLabel(boardId: number, labelId: number) {
  return run(async (s) => {
    await deck.deleteLabel(s, id(boardId), id(labelId))
    revalidatePath(`/projects/${boardId}`, 'layout')
    return null
  })
}

// ---- People: Deck sharing as Jira-style roles ----

export type ProjectRole = 'viewer' | 'member' | 'admin'

const ROLE_PERMISSIONS: Record<ProjectRole, deck.AclPermissions> = {
  viewer: { permissionEdit: false, permissionShare: false, permissionManage: false },
  member: { permissionEdit: true, permissionShare: false, permissionManage: false },
  admin: { permissionEdit: true, permissionShare: true, permissionManage: true },
}
const ACL_TYPE = { user: 0, group: 1, team: 7 } as const
const role = (r: unknown): ProjectRole => (r === 'viewer' || r === 'admin' ? r : 'member')

async function aclOf(s: Parameters<Parameters<typeof run>[0]>[0], boardId: number) {
  return (await deck.getBoard(s, boardId)).acl ?? []
}

export async function addProjectPeople(boardId: number, people: { kind: 'user' | 'group' | 'team'; id: string }[], r: ProjectRole) {
  return run(async (s) => {
    for (const p of people.slice(0, 50)) await deck.addAcl(s, id(boardId), ACL_TYPE[p.kind] ?? 0, text(p.id), ROLE_PERMISSIONS[role(r)])
    revalidatePath(`/projects/${boardId}`, 'layout')
    return aclOf(s, id(boardId))
  })
}

export async function setProjectRole(boardId: number, aclId: number, r: ProjectRole) {
  return run(async (s) => {
    await deck.updateAcl(s, id(boardId), id(aclId), ROLE_PERMISSIONS[role(r)])
    revalidatePath(`/projects/${boardId}`, 'layout')
    return aclOf(s, id(boardId))
  })
}

export async function removeProjectPerson(boardId: number, aclId: number) {
  return run(async (s) => {
    await deck.deleteAcl(s, id(boardId), id(aclId))
    revalidatePath(`/projects/${boardId}`, 'layout')
    return aclOf(s, id(boardId))
  })
}
