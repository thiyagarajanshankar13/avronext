import 'server-only'
import { cache } from 'react'
import { listCollectives, type Collective } from './nextcloud/collectives'
import { listBoards, type DeckBoard } from './nextcloud/deck'
import { NextcloudAuthError } from './nextcloud/http'
import type { Session } from './session'

export type Workspace = {
  boards: DeckBoard[]
  collectives: Collective[]
  /** Set when Deck/Collectives couldn't be loaded (e.g. app not installed). */
  deckError: string | null
  collectivesError: string | null
}

async function settle<T>(p: Promise<T>, fallback: T): Promise<[T, string | null]> {
  try {
    return [await p, null]
  } catch (err) {
    if (err instanceof NextcloudAuthError) throw err
    return [fallback, err instanceof Error ? err.message : String(err)]
  }
}

/** Projects the user can see (one Deck call, deduped per request). */
export const loadBoards = cache(async (s: Session) => {
  const [boards, error] = await settle(listBoards(s), [] as DeckBoard[])
  return { boards: boards.filter((b) => !b.archived), error }
})

/** Spaces the user can see (one Collectives call, deduped per request). */
export const loadCollectives = cache(async (s: Session) => {
  const [collectives, error] = await settle(listCollectives(s), [] as Collective[])
  return { collectives, error }
})

export const loadWorkspace = cache(async (s: Session): Promise<Workspace> => {
  const [b, c] = await Promise.all([loadBoards(s), loadCollectives(s)])
  return { boards: b.boards, collectives: c.collectives, deckError: b.error, collectivesError: c.error }
})
