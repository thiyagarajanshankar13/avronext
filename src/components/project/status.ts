import type { LozengeTone } from '../Lozenge'

/** Jira-like status colour from the column's position: first = to do, last = done, between = in progress. */
export function statusTone(stackIds: number[], stackId: number, done?: string | null): LozengeTone {
  if (done) return 'success'
  const i = stackIds.indexOf(stackId)
  if (i <= 0) return 'default'
  if (i === stackIds.length - 1) return 'success'
  return 'inprogress'
}

/** Label colours come from Deck as hex without '#'; pick readable text for them. */
export function labelStyle(color: string) {
  const hex = /^[0-9a-f]{6}$/i.test(color) ? color : '626f86'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const light = (r * 299 + g * 587 + b * 114) / 1000 > 150
  return { background: `#${hex}`, color: light ? '#172b4d' : '#fff' }
}

/** Colours offered for new labels (Deck stores them without '#'). */
export const LABEL_COLORS = ['31cc7c', '317ccc', 'ff7a66', 'f1db50', '9c4dcc', '0c66e4', 'ae2e24', '626f86']
/** A colour for the next new label, cycling through the palette. */
export const nextLabelColor = (existing: number) => LABEL_COLORS[existing % LABEL_COLORS.length]
