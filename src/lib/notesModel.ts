/** Note model shared by the server actions and the browser (no server-only imports). */

export const NOTE_COLORS = ['default', 'coral', 'peach', 'sand', 'mint', 'sage', 'fog', 'storm', 'dusk', 'blossom', 'clay', 'chalk'] as const
export type NoteColor = (typeof NOTE_COLORS)[number]
export const COLOR_NAMES: Record<NoteColor, string> = {
  default: 'Default',
  coral: 'Coral',
  peach: 'Peach',
  sand: 'Sand',
  mint: 'Mint',
  sage: 'Sage',
  fog: 'Fog',
  storm: 'Storm',
  dusk: 'Dusk',
  blossom: 'Blossom',
  clay: 'Clay',
  chalk: 'Chalk',
}
export const isNoteColor = (c: unknown): c is NoteColor => typeof c === 'string' && (NOTE_COLORS as readonly string[]).includes(c)

/** What one sync returns: every note's version, and the text of those the browser doesn't have yet. */
export type SyncedNote = { id: number; path: string; etag: string; mtime: number; favorite: boolean; shareTypes: number[]; text?: string }
export type SyncResult = { root: string; notes: SyncedNote[]; labels: string[]; meta: Record<string, { color?: string; labels?: string[] }> }

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.(md|txt)$/i, '')

/** "# Title\n\nbody" (title = file name) → titled note; anything else is an untitled note. */
export function parseNote(text: string, path: string): { title: string; body: string } {
  const t = text.replace(/\r\n/g, '\n')
  const m = t.match(/^#\s+(.+)\n?/)
  if (m && m[1].trim() === baseName(path)) return { title: m[1].trim(), body: t.slice(m[0].length).replace(/^\n+/, '') }
  return { title: '', body: t }
}

// ---- Images: "![](.attachments.12/a.png)" lines at the top of the body ----

const IMAGE_LINE = /^!\[[^\]]*\]\((\.attachments\.\d+\/[^)\s]+)\)\s*$/

export function splitBody(body: string): { images: string[]; text: string } {
  const images: string[] = []
  const rest: string[] = []
  for (const line of body.split('\n')) {
    const m = line.match(IMAGE_LINE)
    if (m) images.push(m[1])
    else rest.push(line)
  }
  return { images, text: rest.join('\n').replace(/^\n+/, '') }
}

export function joinBody(images: string[], text: string) {
  return images.length ? `${images.map((h) => `![](${h})`).join('\n')}\n\n${text}` : text
}

// ---- Checklists: a body made only of "- [ ] item" lines ----

export type CheckItem = { checked: boolean; text: string }
const CHECK_LINE = /^\s*[-*] \[( |x|X)\] ?(.*)$/

export function asChecklist(text: string): CheckItem[] | null {
  const lines = text.split('\n').filter((l) => l.trim())
  if (!lines.length || !lines.every((l) => CHECK_LINE.test(l))) return null
  return lines.map((l) => {
    const m = l.match(CHECK_LINE)!
    return { checked: m[1] !== ' ', text: m[2] }
  })
}

export const checklistText = (items: CheckItem[]) => items.map((i) => `- [${i.checked ? 'x' : ' '}] ${i.text}`).join('\n')
export const textToChecklist = (text: string): CheckItem[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((t) => ({ checked: false, text: t.replace(/^[-*]\s+/, '') }))
export const checklistToText = (items: CheckItem[]) => items.map((i) => i.text).join('\n')

/** Image href (relative to the note's folder) → our file proxy. */
export function imageUrl(notePath: string, href: string) {
  const dir = notePath.slice(0, notePath.lastIndexOf('/'))
  let rel = href
  try {
    rel = decodeURIComponent(href)
  } catch {
    /* keep as is */
  }
  return `/api/files?path=${encodeURIComponent(`${dir}/${rel}`.replace(/^\/+/, ''))}`
}
