'use server'

import { revalidatePath } from 'next/cache'
import { run } from '@/lib/actions'
import * as col from '@/lib/nextcloud/collectives'
import { NextcloudError } from '@/lib/nextcloud/http'
import * as teams from '@/lib/nextcloud/teams'

const id = (n: unknown) => {
  const v = Number(n)
  if (!Number.isInteger(v) || v < 0) throw new Error('Invalid id')
  return v
}
const title = (s: unknown) => {
  const v = String(s ?? '').trim().replace(/[\\/]/g, '-')
  if (!v) throw new Error('A title is required.')
  return v.slice(0, 200)
}

export async function createSpace(name: string, emoji: string | null) {
  return run(async (s) => {
    const c = await col.createCollective(s, title(name), emoji || null)
    return { id: c.id }
  })
}

/** `parentId` null = top level (under the space's landing page). */
export async function createPage(collectiveId: number, parentId: number | null, pageTitle: string) {
  return run(async (s) => {
    let parent = parentId
    if (parent === null) {
      const pages = await col.listPages(s, id(collectiveId))
      parent = pages.find((p) => p.parentId === 0)?.id ?? 0
    }
    const page = await col.createPage(s, id(collectiveId), id(parent), title(pageTitle))
    return { id: page.id }
  })
}

/**
 * Saves a page. `etag` is the file version the editor started from: if the
 * page changed since (someone edited it in Nextcloud), nothing is written and
 * `{ conflict: true }` comes back unless `force` is set.
 */
export async function savePage(collectiveId: number, pageId: number, data: { title: string; markdown: string; etag: string | null; force?: boolean }) {
  return run(async (s) => {
    const cid = id(collectiveId)
    let page = await col.getPage(s, cid, id(pageId))
    try {
      await col.writePageContent(s, page, data.markdown, data.force ? null : data.etag)
    } catch (err) {
      if (err instanceof NextcloudError && err.status === 412) return { conflict: true as const, id: page.id }
      throw err
    }
    const newTitle = title(data.title)
    if (page.parentId !== 0 && newTitle !== page.title) {
      page = await col.movePage(s, cid, page.id, { title: newTitle, parentId: page.parentId })
    }
    await col.touchPage(s, cid, page.id).catch(() => undefined)
    return { conflict: false as const, id: page.id }
  })
}

export async function setPageEmoji(collectiveId: number, pageId: number, emoji: string | null) {
  return run(async (s) => {
    await col.setPageEmoji(s, id(collectiveId), id(pageId), emoji || null)
    revalidatePath(`/spaces/${collectiveId}`, 'layout')
    return null
  })
}

export async function movePage(collectiveId: number, pageId: number, parentId: number) {
  return run(async (s) => {
    const page = await col.getPage(s, id(collectiveId), id(pageId))
    await col.movePage(s, id(collectiveId), page.id, { title: page.title, parentId: id(parentId) })
    revalidatePath(`/spaces/${collectiveId}`, 'layout')
    return null
  })
}

export async function trashPage(collectiveId: number, pageId: number) {
  return run(async (s) => {
    await col.trashPage(s, id(collectiveId), id(pageId))
    return null
  })
}

// ---- Space settings: members (the collective's team) and permissions ----

async function teamOf(s: Parameters<Parameters<typeof run>[0]>[0], collectiveId: number) {
  const c = (await col.listCollectives(s)).find((x) => x.id === id(collectiveId))
  if (!c?.circleId) throw new Error('This space has no team (or you are not a member).')
  return c.circleId
}
const level = (l: unknown): 1 | 4 | 8 => (l === 8 || l === 4 ? l : 1)

export async function addSpacePeople(collectiveId: number, people: { kind: 'user' | 'group' | 'team'; id: string }[], lvl: 1 | 4 | 8) {
  return run(async (s) => {
    const team = await teamOf(s, collectiveId)
    for (const p of people.slice(0, 50)) {
      const memberId = await teams.addTeamMember(s, team, p.kind, String(p.id))
      if (level(lvl) !== 1 && memberId) await teams.setTeamMemberLevel(s, team, memberId, level(lvl))
    }
    revalidatePath(`/spaces/${collectiveId}`, 'layout')
    return teams.listTeamMembers(s, team)
  })
}

export async function setSpaceRole(collectiveId: number, memberId: string, lvl: 1 | 4 | 8) {
  return run(async (s) => {
    const team = await teamOf(s, collectiveId)
    await teams.setTeamMemberLevel(s, team, String(memberId), level(lvl))
    revalidatePath(`/spaces/${collectiveId}`, 'layout')
    return teams.listTeamMembers(s, team)
  })
}

export async function removeSpacePerson(collectiveId: number, memberId: string) {
  return run(async (s) => {
    const team = await teamOf(s, collectiveId)
    await teams.removeTeamMember(s, team, String(memberId))
    revalidatePath(`/spaces/${collectiveId}`, 'layout')
    return teams.listTeamMembers(s, team)
  })
}

export async function setSpacePermission(collectiveId: number, which: 'edit' | 'share', lvl: 1 | 4 | 8) {
  return run(async (s) => {
    const c = await col.setPermissionLevel(s, id(collectiveId), which === 'share' ? 'share' : 'edit', level(lvl))
    revalidatePath(`/spaces/${collectiveId}`, 'layout')
    return { edit: c.editPermissionLevel ?? 1, share: c.sharePermissionLevel ?? 1 }
  })
}

export async function setSpaceIcon(collectiveId: number, emoji: string | null) {
  return run(async (s) => {
    await col.setCollectiveEmoji(s, id(collectiveId), emoji || null)
    revalidatePath('/', 'layout')
    return null
  })
}

/** Moves the space to the Collectives trash. The caller navigates away (useGoFresh). */
export async function trashSpace(collectiveId: number) {
  return run(async (s) => {
    await col.trashCollective(s, id(collectiveId))
    return null
  })
}
