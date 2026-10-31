/** Browser-side helpers for the Files area (paths are "/" or "/a/b"). */

export const FILES_CHANGED = 'avronext:files-changed'
export type FilesChanged = { dir: string }
export const notifyFilesChanged = (dir: string) => window.dispatchEvent(new CustomEvent<FilesChanged>(FILES_CHANGED, { detail: { dir } }))

export function folderHref(path: string) {
  const parts = path.split('/').filter(Boolean)
  return parts.length ? `/files/${parts.map(encodeURIComponent).join('/')}` : '/files'
}

export const parentOf = (path: string) => {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}
export const joinPath = (dir: string, name: string) => (dir === '/' ? '' : dir) + '/' + name
export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

const q = (path: string) => encodeURIComponent(path.replace(/^\/+/, ''))
export const viewUrl = (path: string) => `/api/files?path=${q(path)}&view`
export const downloadUrl = (path: string) => `/api/files?path=${q(path)}&download`
export const zipUrl = (dir: string, names: string[]) =>
  `/api/files/zip?${new URLSearchParams([['dir', dir], ...names.map((n) => ['name', n])])}`
export const previewUrl = (id: number, size: number) => `/api/preview/${id}?size=${size}`

export type FileKind = 'folder' | 'image' | 'pdf' | 'video' | 'audio' | 'markdown' | 'text' | 'word' | 'sheet' | 'slides' | 'archive' | 'other'

const EXT: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', bmp: 'image', svg: 'image', heic: 'image', heif: 'image', tif: 'image', tiff: 'image',
  pdf: 'pdf',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', mkv: 'video', avi: 'video',
  mp3: 'audio', m4a: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio', opus: 'audio',
  md: 'markdown', markdown: 'markdown',
  txt: 'text', log: 'text', json: 'text', xml: 'text', yml: 'text', yaml: 'text', ini: 'text', conf: 'text', js: 'text', ts: 'text', tsx: 'text', jsx: 'text',
  css: 'text', html: 'text', py: 'text', sh: 'text', sql: 'text', php: 'text', java: 'text', c: 'text', h: 'text', cpp: 'text', go: 'text', rs: 'text', rb: 'text', env: 'text', toml: 'text',
  docx: 'word', doc: 'word', odt: 'word', rtf: 'word',
  xlsx: 'sheet', xls: 'sheet', xlsm: 'sheet', ods: 'sheet', csv: 'sheet', tsv: 'sheet',
  pptx: 'slides', ppt: 'slides', odp: 'slides',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', tgz: 'archive',
}

export const extOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '')

export function fileKind(item: { name: string; isDir: boolean; mime: string }): FileKind {
  if (item.isDir) return 'folder'
  const byExt = EXT[extOf(item.name)]
  if (byExt) return byExt
  const m = item.mime
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf') return 'pdf'
  if (m.startsWith('text/')) return 'text'
  return 'other'
}

/** What the in-browser viewer can show (old binary Office formats can't be read). */
export function canView(item: { name: string; isDir: boolean; mime: string; hasPreview?: boolean }) {
  const kind = fileKind(item)
  const ext = extOf(item.name)
  if (kind === 'word') return ext === 'docx'
  if (kind === 'slides') return ext === 'pptx'
  if (kind === 'sheet') return true
  if (kind === 'image') return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(ext) || Boolean(item.hasPreview)
  return ['pdf', 'video', 'audio', 'markdown', 'text'].includes(kind)
}

export function fmtSize(bytes?: number) {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export const can = {
  create: (perms: string) => perms.includes('C'),
  write: (perms: string) => perms.includes('W'),
  remove: (perms: string) => perms.includes('D'),
  rename: (perms: string) => perms.includes('N'),
  move: (perms: string) => perms.includes('V') || perms.includes('N'),
  share: (perms: string) => perms.includes('R'),
}

/** First free "name (2).ext" given the names already in a folder. */
export function freeName(name: string, taken: Set<string>) {
  if (!taken.has(name)) return name
  const dot = name.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let n = 2; ; n++) if (!taken.has(`${stem} (${n})${ext}`)) return `${stem} (${n})${ext}`
}
