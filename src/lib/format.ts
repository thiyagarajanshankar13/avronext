const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

const toDate = (v: string | number) => (typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v))

export const fmtDate = (v: string | number) => dateFmt.format(toDate(v))
export const fmtDateTime = (v: string | number) => timeFmt.format(toDate(v))
export function fmtShort(v: string | number) {
  const d = toDate(v)
  return d.getFullYear() === new Date().getFullYear() ? shortFmt.format(d) : dateFmt.format(d)
}

/** "3 minutes ago", "yesterday", … ; accepts unix seconds or ISO strings. */
export function fmtRelative(v: string | number) {
  const diff = (toDate(v).getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.35, 'week'],
    [12, 'month'],
    [Infinity, 'year'],
  ]
  let value = diff
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit)
    value /= size
  }
  return fmtDate(v)
}

export type DueState = 'overdue' | 'soon' | 'later'
export function dueState(iso: string, done = false): DueState {
  if (done) return 'later'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms < 0) return 'overdue'
  return ms < 1000 * 60 * 60 * 48 ? 'soon' : 'later'
}

/** ISO timestamp → yyyy-mm-dd in the browser's time zone (for <input type="date">). */
export function isoToDateInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
