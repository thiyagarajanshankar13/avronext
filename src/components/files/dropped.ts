'use client'

/** A file to upload and its path relative to the drop target ("photos/2024/a.jpg"). */
export type Picked = { file: File; rel: string }

type Entry = FileSystemEntry
const isFile = (e: Entry): e is FileSystemFileEntry => e.isFile
const isDir = (e: Entry): e is FileSystemDirectoryEntry => e.isDirectory

function readAll(dir: FileSystemDirectoryEntry): Promise<Entry[]> {
  const reader = dir.createReader()
  const out: Entry[] = []
  return new Promise((resolve, reject) => {
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(out)
        out.push(...batch)
        next()
      }, reject)
    next()
  })
}

async function walk(entry: Entry, prefix: string, out: Picked[], dirs: string[]) {
  if (isFile(entry)) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject))
    out.push({ file, rel: prefix + file.name })
  } else if (isDir(entry)) {
    const rel = prefix + entry.name
    dirs.push(rel)
    for (const child of await readAll(entry)) await walk(child, rel + '/', out, dirs)
  }
}

/** Files and folders dropped from the desktop (folders walked recursively; empty folders kept). */
export async function collectDropped(dt: DataTransfer): Promise<{ files: Picked[]; dirs: string[] }> {
  const entries = Array.from(dt.items ?? [])
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is Entry => Boolean(e))
  if (!entries.length) return { files: Array.from(dt.files).map((file) => ({ file, rel: file.name })), dirs: [] }
  const files: Picked[] = []
  const dirs: string[] = []
  for (const e of entries) await walk(e, '', files, dirs)
  return { files, dirs }
}

/** From an <input type=file> (with `webkitdirectory`, names carry the folder path). */
export function collectInput(list: FileList): { files: Picked[]; dirs: string[] } {
  const files = Array.from(list).map((file) => ({ file, rel: file.webkitRelativePath || file.name }))
  const dirs = new Set<string>()
  for (const f of files) {
    const parts = f.rel.split('/').slice(0, -1)
    for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  return { files, dirs: [...dirs] }
}

export const hasFiles = (dt: DataTransfer | null) => Array.from(dt?.types ?? []).includes('Files')
