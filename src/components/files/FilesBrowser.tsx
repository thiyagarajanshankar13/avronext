'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { deleteItems, moveItems, reloadView, setFavorite } from '@/app/(app)/files/actions'
import type { FileRow, FilesData } from '@/app/(app)/files/data'
import { fmtDate, fmtRelative } from '@/lib/format'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import { Modal } from '../Modal'
import { FAB_EVENT } from '@/lib/fab'
import { clearShared, readShared } from '@/lib/sharedItems'
import { startNavProgress } from '../NavProgress'
import { DetailsPane } from './DetailsPane'
import { DeleteDialog, MoveDialog, NameDialog } from './dialogs'
import { collectDropped, collectInput, hasFiles, type Picked } from './dropped'
import { FileIcon } from './FileIcon'
import { can, canView, downloadUrl, fileKind, FILES_CHANGED, folderHref, fmtSize, parentOf, zipUrl, type FilesChanged } from './paths'
import { ShareDialog } from './ShareDialog'
import { useUploadFlow } from './useUploadFlow'
import { FileViewer } from './viewer/FileViewer'

type SortKey = 'name' | 'mtime' | 'size'
type Sort = { key: SortKey; desc: boolean }
type Dialog =
  | null
  | { kind: 'newFolder' }
  | { kind: 'rename'; item: FileRow }
  | { kind: 'move' | 'copy'; items: FileRow[] }
  | { kind: 'delete'; items: FileRow[] }
  | { kind: 'share'; item: FileRow }
  | { kind: 'add' }

const DRAG_TYPE = 'application/x-avronext-files'
const EMPTY: Record<string, string> = {
  files: 'This folder is empty. Drop files here or use Upload.',
  recent: 'No recently changed files.',
  favorites: 'Star files and folders to find them here.',
  shared: 'Nothing has been shared with you yet.',
  sharing: 'You haven’t shared anything yet.',
}

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback
  } catch {
    return fallback
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode */
  }
}

export function FilesBrowser({ initial, title }: { initial: FilesData; title: string }) {
  const router = useRouter()
  const { view, path, folder } = initial
  const [items, setItems] = useState<FileRow[]>(initial.items)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const anchor = useRef<string | null>(null)
  const [sort, setSort] = useState<Sort>({ key: view === 'recent' ? 'mtime' : 'name', desc: view === 'recent' })
  const [layout, setLayout] = useState<'list' | 'tiles'>('list')
  const [details, setDetails] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const params = useSearchParams()
  const listRef = useRef<HTMLDivElement>(null)
  const dragDepth = useRef(0)

  const isFolderView = view === 'files'
  const canCreateHere = isFolderView && can.create(folder?.permissions ?? '')
  const upload = useUploadFlow()
  // Uploads from Recent/Favourites/Shared land in My files.
  const uploadDir = isFolderView ? path : '/'
  const canAdd = isFolderView ? canCreateHere : true

  // Phones: the + button, and the app-icon shortcut "Upload file" (/files?add=1), open the Add sheet.
  useEffect(() => {
    const onFab = (e: Event) => (e as CustomEvent<string>).detail === 'files' && canAdd && setDialog({ kind: 'add' })
    window.addEventListener(FAB_EVENT, onFab)
    return () => window.removeEventListener(FAB_EVENT, onFab)
  }, [canAdd])
  useEffect(() => {
    if (params.get('add') === '1' && canAdd) setDialog({ kind: 'add' })
  }, [params, canAdd])
  // Files shared from another app ("Save to Files" on /share) upload here, once.
  const sharedTaken = useRef(false)
  useEffect(() => {
    if (params.get('shared') !== '1' || !isFolderView || sharedTaken.current) return
    sharedTaken.current = true
    readShared().then((shared) => {
      if (!shared?.files.length) return
      clearShared()
      startUpload(path, { files: shared.files.map((file) => ({ file, rel: file.name })), dirs: [] })
      window.history.replaceState(null, '', folderHref(path))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, isFolderView, path])

  useEffect(() => {
    setLayout(readPref('avronext.files.layout', 'list'))
    setDetails(readPref<string>('avronext.files.details', '0') === '1')
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // ---- Fresh data: after uploads, on tab refocus ----
  const reload = useCallback(async () => {
    const r = await reloadView(view, path)
    if (!r.ok) return
    setItems(r.data.items)
    setSelected((sel) => new Set([...sel].filter((p) => r.data.items.some((i) => i.path === p))))
  }, [view, path])

  useEffect(() => {
    const onChange = (e: Event) => {
      const { dir } = (e as CustomEvent<FilesChanged>).detail
      if (!isFolderView || dir === path) reload()
    }
    const onVisible = () => document.visibilityState === 'visible' && reload()
    window.addEventListener(FILES_CHANGED, onChange)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(FILES_CHANGED, onChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload, isFolderView, path])

  const sorted = useMemo(() => {
    const dir = sort.desc ? -1 : 1
    const cmp = (a: FileRow, b: FileRow) => {
      if (view !== 'recent' && a.isDir !== b.isDir) return a.isDir ? -1 : 1
      if (sort.key === 'mtime') return (a.mtime - b.mtime) * dir
      if (sort.key === 'size') return (a.size - b.size) * dir
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * dir
    }
    return [...items].sort(cmp)
  }, [items, sort, view])

  const selection = useMemo(() => sorted.filter((i) => selected.has(i.path)), [sorted, selected])
  const single = selection.length === 1 ? selection[0] : null
  const viewable = useMemo(() => sorted.filter((i) => !i.isDir), [sorted])

  // ---- Selection ----
  const selectOnly = (p: string) => {
    setSelected(new Set([p]))
    anchor.current = p
  }
  const toggle = (p: string) => {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(p)) n.delete(p)
      else n.add(p)
      return n
    })
    anchor.current = p
  }
  const rangeTo = (p: string) => {
    const from = sorted.findIndex((i) => i.path === anchor.current)
    const to = sorted.findIndex((i) => i.path === p)
    if (from < 0 || to < 0) return selectOnly(p)
    const [a, b] = from < to ? [from, to] : [to, from]
    setSelected(new Set(sorted.slice(a, b + 1).map((i) => i.path)))
  }
  const onRowClick = (e: ReactMouseEvent, it: FileRow) => {
    if (e.shiftKey) rangeTo(it.path)
    else if (e.metaKey || e.ctrlKey) toggle(it.path)
    else selectOnly(it.path)
  }
  const clearSelection = () => setSelected(new Set())

  // ---- Actions ----
  const open = (it: FileRow) => {
    if (it.isDir) {
      startNavProgress()
      router.push(folderHref(it.path))
    } else if (canView(it)) setViewing(it.path)
    else download([it])
  }

  const download = (list: FileRow[]) => {
    const go = (href: string) => {
      const a = document.createElement('a')
      a.href = href
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    if (list.length === 1 && !list[0].isDir) return go(downloadUrl(list[0].path))
    const dirs = new Set(list.map((i) => parentOf(i.path)))
    if (dirs.size === 1) return go(zipUrl([...dirs][0], list.map((i) => i.name)))
    list.forEach((i, n) => setTimeout(() => go(i.isDir ? zipUrl(parentOf(i.path), [i.name]) : downloadUrl(i.path)), n * 400))
  }

  const toggleFavorite = async (list: FileRow[]) => {
    const value = !list.every((i) => i.favorite)
    const paths = new Set(list.map((i) => i.path))
    setItems((its) => (view === 'favorites' && !value ? its.filter((i) => !paths.has(i.path)) : its.map((i) => (paths.has(i.path) ? { ...i, favorite: value } : i))))
    for (const it of list) {
      const r = await setFavorite(it.path, value)
      if (!r.ok) {
        setToast(r.error)
        return reload()
      }
    }
  }

  const doMove = async (list: FileRow[], dest: string, op: 'move' | 'copy') => {
    const r = await moveItems(
      list.map((i) => i.path),
      dest,
      op,
    )
    if (!r.ok) return setToast(r.error)
    const failed = r.data.filter((o) => o.error)
    const ok = r.data.length - failed.length
    if (op === 'move' && isFolderView) {
      const gone = new Set(r.data.filter((o) => !o.error).map((o) => o.path))
      setItems((its) => its.filter((i) => !gone.has(i.path)))
      clearSelection()
    } else reload()
    if (dest === path && op === 'copy') reload()
    const where = dest === '/' ? 'My files' : dest.split('/').pop()
    setToast(
      failed.length
        ? `${failed.length} item${failed.length > 1 ? 's' : ''} couldn’t be ${op === 'move' ? 'moved' : 'copied'}: ${failed[0].error}`
        : `${op === 'move' ? 'Moved' : 'Copied'} ${ok} item${ok > 1 ? 's' : ''} to ${where}.`,
    )
  }

  const doDelete = async (list: FileRow[]) => {
    const paths = new Set(list.map((i) => i.path))
    setItems((its) => its.filter((i) => !paths.has(i.path)))
    clearSelection()
    const r = await deleteItems([...paths])
    if (!r.ok) {
      setToast(r.error)
      return reload()
    }
    const failed = r.data.filter((o) => o.error)
    if (failed.length) {
      setToast(`${failed.length} item${failed.length > 1 ? 's' : ''} couldn’t be deleted: ${failed[0].error}`)
      reload()
    } else setToast(`Deleted ${list.length} item${list.length > 1 ? 's' : ''}. Restore from Deleted files in Nextcloud.`)
  }

  const startUpload = (dir: string, picked: { files: Picked[]; dirs: string[] }) => {
    if (!picked.files.length && !picked.dirs.length) return
    upload.start(dir, picked, (msg) => setToast(msg))
  }

  // ---- Keyboard ----
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (dialog || viewing || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setSelected(new Set(sorted.map((i) => i.path)))
    } else if (e.key === 'Escape') clearSelection()
    else if ((e.key === 'Delete' || (e.key === 'Backspace' && mod)) && selection.length && selection.every((i) => can.remove(i.permissions))) setDialog({ kind: 'delete', items: selection })
    else if (e.key === 'F2' && single && can.rename(single.permissions)) setDialog({ kind: 'rename', item: single })
    else if (e.key === 'Enter' && single) open(single)
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && sorted.length) {
      e.preventDefault()
      const at = sorted.findIndex((i) => i.path === anchor.current)
      const next = sorted[Math.max(0, Math.min(sorted.length - 1, at < 0 ? 0 : at + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (e.shiftKey) {
        setSelected((s) => new Set(s).add(next.path))
        anchor.current = next.path
      } else selectOnly(next.path)
      listRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(next.path)}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }

  // ---- Drag and drop: rows onto folders (move), desktop files anywhere (upload) ----
  const onRowDragStart = (e: DragEvent, it: FileRow) => {
    const list = selected.has(it.path) ? selection : [it]
    if (!list.every((i) => can.move(i.permissions))) return e.preventDefault()
    if (!selected.has(it.path)) selectOnly(it.path)
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(list.map((i) => i.path)))
    e.dataTransfer.effectAllowed = 'move'
  }
  const isInternal = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(DRAG_TYPE)
  const folderDropProps = (target: string, enabled: boolean) =>
    enabled
      ? {
          onDragOver: (e: DragEvent) => {
            if (!isInternal(e) && !hasFiles(e.dataTransfer)) return
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = isInternal(e) ? 'move' : 'copy'
            setDropTarget(target)
          },
          onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
          onDrop: (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setDropTarget(null)
            dragDepth.current = 0
            if (isInternal(e)) {
              const paths = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '[]') as string[]
              const list = items.filter((i) => paths.includes(i.path) && i.path !== target && !target.startsWith(i.path + '/'))
              if (list.length && list.some((i) => parentOf(i.path) !== target)) doMove(list, target, 'move')
            } else collectDropped(e.dataTransfer).then((picked) => startUpload(target, picked))
          },
        }
      : {}

  const mainDrop = canCreateHere
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e.dataTransfer) || isInternal(e)) return
          dragDepth.current++
          setDropTarget((t) => t ?? path)
        },
        onDragLeave: (e: DragEvent) => {
          if (!hasFiles(e.dataTransfer) || isInternal(e)) return
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (!dragDepth.current) setDropTarget(null)
        },
        onDragOver: (e: DragEvent) => {
          if (!hasFiles(e.dataTransfer) || isInternal(e)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDropTarget(path)
        },
        onDrop: (e: DragEvent) => {
          if (!hasFiles(e.dataTransfer) || isInternal(e)) return
          e.preventDefault()
          dragDepth.current = 0
          setDropTarget(null)
          collectDropped(e.dataTransfer).then((picked) => startUpload(path, picked))
        },
      }
    : {}

  // ---- Commands for the current selection (toolbar, row menu, right-click) ----
  type Cmd = { key: string; label: string; icon: Parameters<typeof Icon>[0]['name']; run: () => void; danger?: boolean }
  const commandsFor = (list: FileRow[]): Cmd[] => {
    if (!list.length) return []
    const one = list.length === 1 ? list[0] : null
    const cmds: Cmd[] = []
    if (one) cmds.push({ key: 'open', label: one.isDir ? 'Open' : canView(one) ? 'Open' : 'Download', icon: one.isDir ? 'folder' : canView(one) ? 'external' : 'download', run: () => open(one) })
    if (!(one && !one.isDir && !canView(one))) cmds.push({ key: 'download', label: 'Download', icon: 'download', run: () => download(list) })
    if (one && can.share(one.permissions)) cmds.push({ key: 'share', label: 'Share', icon: 'share', run: () => setDialog({ kind: 'share', item: one }) })
    const allFav = list.every((i) => i.favorite)
    if (view !== 'shared') cmds.push({ key: 'fav', label: allFav ? 'Remove from favourites' : 'Add to favourites', icon: allFav ? 'star' : 'starOutline', run: () => toggleFavorite(list) })
    if (one && can.rename(one.permissions) && view !== 'shared') cmds.push({ key: 'rename', label: 'Rename', icon: 'edit', run: () => setDialog({ kind: 'rename', item: one }) })
    if (list.every((i) => can.move(i.permissions)) && view !== 'shared') cmds.push({ key: 'move', label: 'Move to…', icon: 'move', run: () => setDialog({ kind: 'move', items: list }) })
    cmds.push({ key: 'copy', label: 'Copy to…', icon: 'copy', run: () => setDialog({ kind: 'copy', items: list }) })
    if (!isFolderView && one) cmds.push({ key: 'location', label: 'Open file location', icon: 'folder', run: () => (startNavProgress(), router.push(folderHref(parentOf(one.path)))) })
    if (list.every((i) => can.remove(i.permissions)) && view !== 'shared') cmds.push({ key: 'delete', label: 'Delete', icon: 'trash', danger: true, run: () => setDialog({ kind: 'delete', items: list }) })
    cmds.push({ key: 'details', label: 'Details', icon: 'info', run: () => setDetailsOpen(true) })
    return cmds
  }
  const setDetailsOpen = (v: boolean) => {
    setDetails(v)
    writePref('avronext.files.details', v ? '1' : '0')
  }
  const commands = commandsFor(selection)

  const crumbs = useMemo(() => {
    const parts = path.split('/').filter(Boolean)
    return [{ name: 'My files', path: '/' }, ...parts.map((p, i) => ({ name: p, path: '/' + parts.slice(0, i + 1).join('/') }))]
  }, [path])

  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }))
  const sortMark = (key: SortKey) => (sort.key === key ? <Icon name="chevronDown" size={14} className={sort.desc ? '' : 'rot-180'} /> : null)
  const extraCol = view === 'shared' ? 'Shared by' : view === 'sharing' ? 'Shared with' : view === 'recent' || view === 'favorites' ? 'Location' : null
  const extraValue = (it: FileRow) =>
    view === 'shared' ? it.sharedBy : view === 'sharing' ? it.sharedWith?.join(', ') : parentOf(it.path) === '/' ? 'My files' : parentOf(it.path).slice(1)

  const rowCommandsMenu = (it: FileRow) => (
    <Menu
      align="right"
      className="file-row-menu"
      label={`More actions for ${it.name}`}
      trigger={
        <span className="icon-btn icon-btn-sm">
          <Icon name="more" />
        </span>
      }
    >
      {(close) =>
        commandsFor(selected.has(it.path) ? selection : [it]).map((c) => (
          <button
            key={c.key}
            className={`menu-item${c.danger ? ' menu-item-danger' : ''}`}
            onClick={() => {
              close()
              if (!selected.has(it.path)) selectOnly(it.path)
              c.run()
            }}
          >
            <Icon name={c.icon} /> {c.label}
          </button>
        ))
      }
    </Menu>
  )

  return (
    <div className={`files${details ? ' has-details' : ''}`} onKeyDown={onKeyDown}>
      <div className="files-content" {...mainDrop}>
        <div className="files-header">
          {isFolderView ? (
            <nav className="files-crumbs" aria-label="Folder path">
              {crumbs.map((c, i) => (
                <span key={c.path} className="files-crumb">
                  {i > 0 && <Icon name="chevronRight" size={14} className="files-crumb-sep" />}
                  {i === crumbs.length - 1 ? (
                    <h1 className="files-crumb-current">{c.name}</h1>
                  ) : (
                    <Link prefetch={false} href={folderHref(c.path)} className={`files-crumb-link${dropTarget === c.path ? ' is-drop' : ''}`} {...folderDropProps(c.path, true)}>
                      {c.name}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          ) : (
            <h1 className="files-title">{title}</h1>
          )}
        </div>

        <div className="files-commands" role="toolbar" aria-label="File commands">
          {selection.length ? (
            <>
              {commands
                .filter((c) => c.key !== 'details')
                .map((c) => (
                  <button key={c.key} className={`btn btn-subtle files-cmd${c.danger ? ' files-cmd-danger' : ''}`} onClick={c.run}>
                    <Icon name={c.icon} /> <span className="files-cmd-label">{c.label}</span>
                  </button>
                ))}
              <span className="files-commands-spacer" />
              <button className="btn btn-subtle files-selected-count" onClick={clearSelection} aria-label="Clear selection">
                <Icon name="close" /> {selection.length} selected
              </button>
            </>
          ) : (
            <>
              {canCreateHere && (
                <>
                  <Menu
                    label="New"
                    trigger={
                      <span className="btn btn-primary">
                        <Icon name="plus" /> New <Icon name="chevronDown" size={14} />
                      </span>
                    }
                  >
                    {(close) => (
                      <>
                        <button className="menu-item" onClick={() => (close(), setDialog({ kind: 'newFolder' }))}>
                          <Icon name="folderPlus" /> Folder
                        </button>
                        <div className="menu-sep" />
                        <button className="menu-item" onClick={() => (close(), fileInput.current?.click())}>
                          <Icon name="upload" /> Upload files
                        </button>
                        <button className="menu-item" onClick={() => (close(), folderInput.current?.click())}>
                          <Icon name="folder" /> Upload folder
                        </button>
                      </>
                    )}
                  </Menu>
                  <button className="btn btn-subtle files-cmd" onClick={() => fileInput.current?.click()}>
                    <Icon name="upload" /> <span className="files-cmd-label">Upload</span>
                  </button>
                </>
              )}
              {isFolderView && sorted.length > 0 && (
                <button className="btn btn-subtle files-cmd" onClick={() => download(sorted)}>
                  <Icon name="download" /> <span className="files-cmd-label">Download all</span>
                </button>
              )}
              <span className="files-commands-spacer" />
            </>
          )}
          <Menu
            align="right"
            label="Sort"
            trigger={
              <span className="btn btn-subtle files-cmd">
                <Icon name="sort" /> <span className="files-cmd-label">Sort</span>
              </span>
            }
          >
            {(close) =>
              (
                [
                  ['name', 'Name'],
                  ['mtime', 'Modified'],
                  ['size', 'Size'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className="menu-item" onClick={() => (close(), sortBy(k))}>
                  {sort.key === k ? <Icon name="check" /> : <span className="menu-icon-pad" />} {label}
                  {sort.key === k && <span className="muted small">{sort.desc ? (k === 'name' ? 'Z–A' : 'Newest/largest') : k === 'name' ? 'A–Z' : 'Oldest/smallest'}</span>}
                </button>
              ))
            }
          </Menu>
          <button
            className="icon-btn"
            aria-label={layout === 'list' ? 'Show as tiles' : 'Show as list'}
            title={layout === 'list' ? 'Tiles' : 'List'}
            onClick={() => {
              const next = layout === 'list' ? 'tiles' : 'list'
              setLayout(next)
              writePref('avronext.files.layout', next)
            }}
          >
            <Icon name={layout === 'list' ? 'grid' : 'list'} />
          </button>
          <button className={`icon-btn${details ? ' is-active' : ''}`} aria-label="Details" aria-pressed={details} title="Details" onClick={() => setDetailsOpen(!details)}>
            <Icon name="info" />
          </button>
        </div>

        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) startUpload(uploadDir, collectInput(e.target.files))
            e.target.value = ''
          }}
        />
        {/* Phones: opens the camera; the photo uploads straight into this folder. */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              const ext = (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
              const name = /^image\.\w+$/i.test(f.name) || !f.name ? `Photo ${new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.')}.${ext}` : f.name
              startUpload(uploadDir, { files: [{ file: new File([f], name, { type: f.type }), rel: name }], dirs: [] })
            }
            e.target.value = ''
          }}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          {...({ webkitdirectory: '' } as object)}
          onChange={(e) => {
            if (e.target.files) startUpload(path, collectInput(e.target.files))
            e.target.value = ''
          }}
        />

        <div
          ref={listRef}
          className={`files-body${dropTarget === path && canCreateHere ? ' is-drop' : ''}`}
          tabIndex={-1}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) clearSelection()
          }}
        >
          {sorted.length === 0 ? (
            <div className="files-empty">
              <TypeEmpty />
              <p>{EMPTY[view]}</p>
              {canCreateHere && (
                <button className="btn btn-default" onClick={() => fileInput.current?.click()}>
                  <Icon name="upload" /> Upload files
                </button>
              )}
            </div>
          ) : layout === 'list' ? (
            <table className="files-table">
              <thead>
                <tr>
                  <th className="files-col-check">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={selection.length === sorted.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selection.length > 0 && selection.length < sorted.length
                      }}
                      onChange={(e) => setSelected(e.target.checked ? new Set(sorted.map((i) => i.path)) : new Set())}
                    />
                  </th>
                  <th className="files-col-name">
                    <button className="files-sort" onClick={() => sortBy('name')}>
                      Name {sortMark('name')}
                    </button>
                  </th>
                  <th className="files-col-date">
                    <button className="files-sort" onClick={() => sortBy('mtime')}>
                      Modified {sortMark('mtime')}
                    </button>
                  </th>
                  {extraCol && <th className="files-col-extra">{extraCol}</th>}
                  <th className="files-col-size">
                    <button className="files-sort" onClick={() => sortBy('size')}>
                      Size {sortMark('size')}
                    </button>
                  </th>
                  <th className="files-col-menu" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((it) => {
                  const isSel = selected.has(it.path)
                  return (
                    <tr
                      key={it.path}
                      data-path={it.path}
                      className={`files-row${isSel ? ' is-selected' : ''}${dropTarget === it.path ? ' is-drop' : ''}`}
                      draggable={view !== 'shared'}
                      onDragStart={(e) => onRowDragStart(e, it)}
                      onClick={(e) => onRowClick(e, it)}
                      onDoubleClick={() => open(it)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        if (!isSel) selectOnly(it.path)
                        setCtx({ x: e.clientX, y: e.clientY })
                      }}
                      {...folderDropProps(it.path, it.isDir && can.create(it.permissions))}
                    >
                      <td className="files-col-check" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSel} onChange={() => toggle(it.path)} aria-label={`Select ${it.name}`} />
                      </td>
                      <td className="files-col-name">
                        <span className="files-name-cell">
                          <FileIcon item={it} size={28} thumb={['image', 'video'].includes(fileKind(it)) ? 64 : 0} />
                          <button
                            className="files-name"
                            onClick={(e) => {
                              if (e.shiftKey || e.metaKey || e.ctrlKey) return
                              e.stopPropagation()
                              open(it)
                            }}
                            title={it.name}
                          >
                            {it.name}
                          </button>
                          {it.favorite && <Icon name="star" size={14} className="files-fav" aria-label="Favourite" />}
                          {it.shareTypes.length > 0 && view !== 'sharing' && <Icon name="share" size={13} className="files-shared" aria-label="Shared" />}
                        </span>
                      </td>
                      <td className="files-col-date" title={fmtDate(it.mtime)} suppressHydrationWarning>
                        {fmtRelative(it.mtime)}
                      </td>
                      {extraCol && (
                        <td className="files-col-extra" title={extraValue(it)}>
                          {extraValue(it)}
                        </td>
                      )}
                      <td className="files-col-size">{it.isDir && !it.size ? '' : fmtSize(it.size)}</td>
                      <td className="files-col-menu" onClick={(e) => e.stopPropagation()}>
                        {rowCommandsMenu(it)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <ul className="files-tiles">
              {sorted.map((it) => {
                const isSel = selected.has(it.path)
                return (
                  <li
                    key={it.path}
                    data-path={it.path}
                    className={`files-tile${isSel ? ' is-selected' : ''}${dropTarget === it.path ? ' is-drop' : ''}`}
                    draggable={view !== 'shared'}
                    onDragStart={(e) => onRowDragStart(e, it)}
                    onClick={(e) => onRowClick(e, it)}
                    onDoubleClick={() => open(it)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      if (!isSel) selectOnly(it.path)
                      setCtx({ x: e.clientX, y: e.clientY })
                    }}
                    {...folderDropProps(it.path, it.isDir && can.create(it.permissions))}
                  >
                    <input
                      type="checkbox"
                      className="files-tile-check"
                      checked={isSel}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggle(it.path)}
                      aria-label={`Select ${it.name}`}
                    />
                    <div className="files-tile-thumb">
                      <FileIcon item={it} size={it.hasPreview ? 160 : 72} thumb={256} />
                    </div>
                    <button
                      className="files-name files-tile-name"
                      title={it.name}
                      onClick={(e) => {
                        if (e.shiftKey || e.metaKey || e.ctrlKey) return
                        e.stopPropagation()
                        open(it)
                      }}
                    >
                      {it.name}
                    </button>
                    <span className="files-tile-sub" suppressHydrationWarning>
                      {it.favorite && <Icon name="star" size={12} className="files-fav" />}
                      {fmtRelative(it.mtime)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {dropTarget === path && canCreateHere && (
            <div className="files-drop-hint">
              <Icon name="upload" size={20} /> Drop to upload to {path === '/' ? 'My files' : path.split('/').pop()}
            </div>
          )}
        </div>
      </div>

      {details && (
        <DetailsPane
          item={single}
          count={selection.length}
          folder={isFolderView ? { path, name: crumbs[crumbs.length - 1].name, permissions: folder?.permissions ?? '' } : null}
          onClose={() => setDetailsOpen(false)}
          onShare={(it) => setDialog({ kind: 'share', item: it as FileRow })}
        />
      )}

      {ctx && selection.length > 0 && <ContextMenu at={ctx} commands={commandsFor(selection)} onClose={() => setCtx(null)} />}

      {dialog?.kind === 'newFolder' && (
        <NameDialog
          title="New folder"
          action="Create"
          initial="New folder"
          parent={uploadDir}
          onClose={() => setDialog(null)}
          onDone={(item) => {
            setItems((its) => [...its.filter((i) => i.path !== item.path), item])
            selectOnly(item.path)
          }}
        />
      )}
      {dialog?.kind === 'rename' && (
        <NameDialog
          title="Rename"
          action="Rename"
          initial={dialog.item.name}
          renaming={dialog.item}
          onClose={() => setDialog(null)}
          onDone={(item) => {
            const old = dialog.item.path
            setItems((its) => its.map((i) => (i.path === old ? { ...i, ...item } : i)))
            selectOnly(item.path)
          }}
        />
      )}
      {(dialog?.kind === 'move' || dialog?.kind === 'copy') && (
        <MoveDialog
          op={dialog.kind}
          items={dialog.items}
          start={isFolderView ? path : parentOf(dialog.items[0].path)}
          onClose={() => setDialog(null)}
          onPick={(dest) => {
            setDialog(null)
            doMove(dialog.items, dest, dialog.kind as 'move' | 'copy')
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteDialog
          items={dialog.items}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null)
            doDelete(dialog.items)
          }}
        />
      )}
      {dialog?.kind === 'share' && (
        <ShareDialog
          item={dialog.item}
          onClose={() => setDialog(null)}
          onChanged={(types) => setItems((its) => its.map((i) => (i.path === dialog.item.path ? { ...i, shareTypes: types } : i)))}
        />
      )}
      {upload.dialog}
      {dialog?.kind === 'add' && (
        <Modal title={`Add to ${uploadDir === '/' ? 'My files' : uploadDir.split('/').pop()}`} onClose={() => setDialog(null)} width={420} className="sheet-modal">
          <div className="sheet-actions">
            {(
              [
                ['camera', 'Take photo', () => cameraInput.current?.click()],
                ['upload', 'Upload files', () => fileInput.current?.click()],
                ['folderPlus', 'New folder', () => setDialog({ kind: 'newFolder' })],
              ] as const
            ).map(([icon, label, run]) => (
              <button
                key={label}
                className="sheet-action"
                onClick={() => {
                  if (icon !== 'folderPlus') setDialog(null)
                  run()
                }}
              >
                <span className="sheet-action-icon">
                  <Icon name={icon} size={22} />
                </span>
                {label}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {viewing && (
        <FileViewer
          items={viewable}
          path={viewing}
          onNavigate={(p) => {
            setViewing(p)
            selectOnly(p)
          }}
          onClose={() => setViewing(null)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button className="icon-btn icon-btn-sm" aria-label="Dismiss" onClick={() => setToast(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  )
}

function TypeEmpty() {
  return (
    <svg width="96" height="80" viewBox="0 0 96 80" aria-hidden="true" className="files-empty-art">
      <path d="M10 18a6 6 0 0 1 6-6h20l7 8h37a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="var(--bg-neutral)" />
      <path d="M10 28a6 6 0 0 1 6-6h64a6 6 0 0 1 6 6v38a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="var(--bg-selected)" />
      <path d="M48 36v20m-9-9 9-9 9 9" stroke="var(--brand)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ContextMenu({ at, commands, onClose }: { at: { x: number; y: number }; commands: { key: string; label: string; icon: Parameters<typeof Icon>[0]['name']; run: () => void; danger?: boolean }[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)
  useEffect(() => {
    const el = ref.current
    if (el) {
      const r = el.getBoundingClientRect()
      setPos({ x: Math.min(at.x, window.innerWidth - r.width - 8), y: Math.min(at.y, window.innerHeight - r.height - 8) })
    }
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return
      if (e.type === 'mousedown' && ref.current?.contains(e.target as Node)) return
      onClose()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [at, onClose])
  return (
    <div ref={ref} className="menu-panel files-context" role="menu" style={{ left: pos.x, top: pos.y }}>
      {commands.map((c) => (
        <button
          key={c.key}
          className={`menu-item${c.danger ? ' menu-item-danger' : ''}`}
          onClick={() => {
            onClose()
            c.run()
          }}
        >
          <Icon name={c.icon} /> {c.label}
        </button>
      ))}
    </div>
  )
}
