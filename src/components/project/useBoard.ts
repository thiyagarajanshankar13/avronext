'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  archiveIssue,
  deleteIssue,
  loadStacks,
  moveIssue,
  reorderColumns,
  setIssueAssignee,
  setIssueLabel,
  updateIssue,
} from '@/app/(app)/projects/actions'
import type { Result } from '@/lib/actions'
import type { CardPatch, DeckCard, DeckLabel, DeckStack, DeckUser } from '@/lib/nextcloud/deck'

/** Window event (detail: { boardId, card }) for issues created outside the board, e.g. the top-nav Create dialog. */
export const ISSUE_CREATED = 'avronext:issue-created'

/**
 * Client-side copy of a board's columns + cards with optimistic mutations.
 * Every change is applied locally first and sent to Nextcloud; on failure the
 * board is reloaded from Nextcloud and the error shown.
 */
export function useBoard(boardId: number, initial: DeckStack[]) {
  const [stacks, setStacks] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(stacks)
  latest.current = stacks

  const reload = useCallback(async () => {
    const r = await loadStacks(boardId)
    if (r.ok) setStacks(r.data)
  }, [boardId])

  // The board owns its state once loaded: later server renders of the page are
  // not adopted (one arriving mid-edit would drop the edit). Fresh data comes
  // from reload(): after column changes, and when the user comes back to the
  // tab (to pick up other people's changes), at most every 30s.
  const lastFocusReload = useRef(Date.now())
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastFocusReload.current < 30_000) return
      lastFocusReload.current = Date.now()
      reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  useEffect(() => {
    const onCreated = (e: Event) => {
      const { boardId: b, card } = (e as CustomEvent<{ boardId: number; card: DeckCard }>).detail
      if (b === boardId && !latest.current.some((s) => s.cards?.some((c) => c.id === card.id))) addLocal(card)
    }
    window.addEventListener(ISSUE_CREATED, onCreated)
    return () => window.removeEventListener(ISSUE_CREATED, onCreated)
  })

  const send = useCallback(
    async <T,>(p: Promise<Result<T>>): Promise<T | null> => {
      const r = await p
      if (r.ok) return r.data
      setError(r.error)
      await reload()
      return null
    },
    [reload],
  )

  const locate = useCallback((cardId: number) => {
    for (const stack of latest.current) {
      const card = stack.cards?.find((c) => c.id === cardId)
      if (card) return { card, stack }
    }
    return null
  }, [])

  const patchLocal = (cardId: number, fn: (c: DeckCard) => DeckCard) =>
    setStacks((prev) => prev.map((s) => ({ ...s, cards: s.cards?.map((c) => (c.id === cardId ? fn(c) : c)) })))

  const removeLocal = (cardId: number) => setStacks((prev) => prev.map((s) => ({ ...s, cards: s.cards?.filter((c) => c.id !== cardId) })))

  const addLocal = (card: DeckCard) =>
    setStacks((prev) =>
      prev.map((s) => (s.id === card.stackId ? { ...s, cards: [...(s.cards ?? []), { ...card, labels: card.labels ?? [], assignedUsers: card.assignedUsers ?? [] }] } : s)),
    )

  const move = async (cardId: number, toStackId: number, index: number) => {
    const found = locate(cardId)
    if (!found) return
    setStacks((prev) => {
      const card = { ...found.card, stackId: toStackId }
      const without = prev.map((s) => ({ ...s, cards: (s.cards ?? []).filter((c) => c.id !== cardId) }))
      return without.map((s) => {
        if (s.id !== toStackId) return s
        const cards = [...(s.cards ?? [])]
        cards.splice(Math.min(index, cards.length), 0, card)
        return { ...s, cards }
      })
    })
    await send(moveIssue(boardId, found.stack.id, cardId, toStackId, index))
  }

  const update = async (cardId: number, patch: CardPatch) => {
    const found = locate(cardId)
    if (!found) return
    patchLocal(cardId, (c) => ({ ...c, ...patch, lastModified: Math.floor(Date.now() / 1000) }))
    const saved = await send(updateIssue(boardId, found.stack.id, cardId, patch))
    if (saved) patchLocal(cardId, (c) => ({ ...c, title: saved.title, description: saved.description, duedate: saved.duedate, done: saved.done }))
  }

  const toggleLabel = async (cardId: number, label: DeckLabel, on: boolean) => {
    const found = locate(cardId)
    if (!found) return
    patchLocal(cardId, (c) => ({ ...c, labels: on ? [...c.labels, label] : c.labels.filter((l) => l.id !== label.id) }))
    await send(setIssueLabel(boardId, found.stack.id, cardId, label.id, on))
  }

  const toggleAssignee = async (cardId: number, user: DeckUser, on: boolean) => {
    const found = locate(cardId)
    if (!found) return
    patchLocal(cardId, (c) => ({
      ...c,
      assignedUsers: on
        ? [...c.assignedUsers, { id: -Date.now(), cardId, type: 0, participant: user }]
        : c.assignedUsers.filter((a) => a.participant.uid !== user.uid),
    }))
    await send(setIssueAssignee(boardId, found.stack.id, cardId, user.uid, on))
  }

  /** Moves a column to `toIndex` (0-based, among all columns). */
  const moveColumn = async (stackId: number, toIndex: number) => {
    const from = latest.current.findIndex((s) => s.id === stackId)
    if (from < 0) return
    const to = Math.max(0, Math.min(toIndex, latest.current.length - 1))
    if (to === from) return
    const next = [...latest.current]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setStacks(next.map((s, order) => ({ ...s, order })))
    await send(reorderColumns(boardId, next.map((s) => s.id)))
  }

  /** Keeps the board's paperclip count in step with uploads/deletes in the issue panel. */
  const adjustAttachments = (cardId: number, delta: number) =>
    patchLocal(cardId, (c) => ({ ...c, attachmentCount: Math.max(0, (c.attachmentCount ?? 0) + delta) }))

  const remove = async (cardId: number, how: 'delete' | 'archive') => {
    const found = locate(cardId)
    if (!found) return
    removeLocal(cardId)
    await send(how === 'delete' ? deleteIssue(boardId, found.stack.id, cardId) : archiveIssue(boardId, found.stack.id, cardId))
  }

  return { stacks, setStacks, error, setError, reload, locate, move, moveColumn, update, toggleLabel, toggleAssignee, remove, addLocal, adjustAttachments }
}

export type BoardApi = ReturnType<typeof useBoard>
