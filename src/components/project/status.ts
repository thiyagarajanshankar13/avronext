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
