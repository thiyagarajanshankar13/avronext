'use client'
import { useSyncExternalStore } from 'react'

/**
 * The open project's label filter, shared by the board/list filter bar, the
 * project sidebar's Labels list and the top-nav "Create issue" dialog (which
 * pre-fills it). In memory only: this tab, kept while moving between Board and
 * List, reset when another project is opened.
 */
export type LabelSummary = { id: number; title: string; color: string; count: number }
type State = {
  boardId: number
  selected: number[]
  /** Published by the mounted board/list view (null elsewhere, e.g. settings). */
  labels: LabelSummary[] | null
}

const EMPTY: number[] = []
let state: State = { boardId: 0, selected: EMPTY, labels: null }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const forBoard = (boardId: number): State => (state.boardId === boardId ? state : { boardId, selected: EMPTY, labels: null })

export function setBoardFilterLabels(boardId: number, labelIds: number[]) {
  state = { ...forBoard(boardId), selected: labelIds }
  emit()
}

export function publishBoardLabels(boardId: number, labels: LabelSummary[] | null) {
  state = { ...forBoard(boardId), labels }
  emit()
}

export function boardFilterLabels(boardId: number): number[] {
  return forBoard(boardId).selected
}

const SERVER: State = { boardId: 0, selected: EMPTY, labels: null }
export function useBoardLabelFilter(boardId: number) {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER)
  return s.boardId === boardId ? s : { boardId, selected: EMPTY, labels: null }
}
