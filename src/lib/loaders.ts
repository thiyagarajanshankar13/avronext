import 'server-only'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import * as col from './nextcloud/collectives'
import * as deck from './nextcloud/deck'
import { loadOrSignOut, NextcloudAppMissingError, NextcloudError } from './nextcloud/http'
import { requireSession } from './session'
import { loadCollectives } from './workspace'

const notFoundOn404 = <T,>(p: Promise<T>) =>
  p.catch((err) => {
    if (err instanceof NextcloudError && (err.status === 404 || err.status === 403) && !(err instanceof NextcloudAppMissingError)) notFound()
    throw err
  })

/** Per-request cached loaders for pages/layouts (layout + page share one fetch). */
export const loadBoard = cache(async (boardId: number) => {
  const s = await requireSession()
  if (!Number.isInteger(boardId) || boardId <= 0) notFound()
  return loadOrSignOut(() => notFoundOn404(deck.getBoard(s, boardId)))
})

export const loadBoardStacks = cache(async (boardId: number) => {
  const s = await requireSession()
  return loadOrSignOut(() => notFoundOn404(deck.getStacks(s, boardId)))
})

export const loadSpace = cache(async (collectiveId: number) => {
  const s = await requireSession()
  if (!Number.isInteger(collectiveId) || collectiveId <= 0) notFound()
  // Shares the request's collectives list with anything else that needs it.
  const { collectives, error } = await loadOrSignOut(() => loadCollectives(s))
  if (error) throw new Error(error)
  const collective = collectives.find((c) => c.id === collectiveId)
  if (!collective) notFound()
  return collective
})

export const loadSpacePages = cache(async (collectiveId: number) => {
  const s = await requireSession()
  return loadOrSignOut(() => notFoundOn404(col.listPages(s, collectiveId)))
})
