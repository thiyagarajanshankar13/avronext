import 'server-only'
import { cache } from 'react'
import { listPages, type Page } from './nextcloud/collectives'
import { getStacks, type DeckBoard, type DeckCard } from './nextcloud/deck'
import { NextcloudAuthError } from './nextcloud/http'
import type { Session } from './session'
import type { Workspace } from './workspace'

export type CardRow = { card: DeckCard; board: DeckBoard; stackTitle: string; stackIndex: number; stackCount: number }
export type PageRow = { page: Page; spaceId: number; spaceName: string; spaceEmoji: string | null }

const LIMIT = 40

/** Loads every board's cards / every space's pages in parallel (bounded), skipping ones that fail. */
async function each<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += 8) {
    const batch = await Promise.allSettled(items.slice(i, i + 8).map(fn))
    for (const r of batch) {
      if (r.status === 'fulfilled') out.push(r.value)
      else if (r.reason instanceof NextcloudAuthError) throw r.reason
    }
  }
  return out
}

/** Cached per request, so several streamed panels share one load. */
export const allCards = cache(async (s: Session, ws: Workspace): Promise<CardRow[]> => {
  const perBoard = await each(ws.boards.slice(0, LIMIT), async (board) => {
    const stacks = await getStacks(s, board.id)
    return stacks.flatMap((st, i) => (st.cards ?? []).map((card) => ({ card, board, stackTitle: st.title, stackIndex: i, stackCount: stacks.length })))
  })
  return perBoard.flat()
})

export const allPages = cache(async (s: Session, ws: Workspace): Promise<PageRow[]> => {
  const perSpace = await each(ws.collectives.slice(0, LIMIT), async (c) =>
    (await listPages(s, c.id)).map((page) => ({ page, spaceId: c.id, spaceName: c.name, spaceEmoji: c.emoji })),
  )
  return perSpace.flat()
})
