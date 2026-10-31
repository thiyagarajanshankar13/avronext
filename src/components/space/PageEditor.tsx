'use client'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { savePage } from '@/app/(app)/spaces/actions'
import { useMarkdownHtml } from '@/lib/markdown.client'
import { collectiveLinkOptions } from '@/lib/pageLinks'
import { useGoFresh } from '@/lib/useGoFresh'
import { isImageName, uploadWithProgress } from '../attachments/upload'
import { useFileDrop } from '../attachments/useFileDrop'
import { RichEditor, type RichEditorHandle, type UploadedFile } from '../editor/RichEditor'
import { Icon } from '../Icon'
import { Modal } from '../Modal'

/** 'visual' = WYSIWYG; the others are the Markdown editor's views. */
type Mode = 'visual' | 'split' | 'write' | 'preview'
const MODES: Mode[] = ['visual', 'split', 'write', 'preview']
const MODE_KEY = 'avronext.editorMode'

/** [label, before, after, placeholder, whole-line prefix?] */
const TOOLS: { label: string; title: string; before: string; after?: string; ph?: string; line?: boolean }[] = [
  { label: 'H2', title: 'Heading', before: '## ', ph: 'Heading', line: true },
  { label: 'H3', title: 'Subheading', before: '### ', ph: 'Subheading', line: true },
  { label: 'B', title: 'Bold (Ctrl+B)', before: '**', after: '**', ph: 'bold' },
  { label: 'I', title: 'Italic (Ctrl+I)', before: '_', after: '_', ph: 'italic' },
  { label: 'S', title: 'Strikethrough', before: '~~', after: '~~', ph: 'text' },
  { label: '• List', title: 'Bulleted list', before: '- ', ph: 'Item', line: true },
  { label: '1. List', title: 'Numbered list', before: '1. ', ph: 'Item', line: true },
  { label: '☐ Task', title: 'Checklist', before: '- [ ] ', ph: 'Task', line: true },
  { label: '“ Quote', title: 'Quote', before: '> ', ph: 'Quote', line: true },
  { label: '</>', title: 'Code', before: '`', after: '`', ph: 'code' },
  { label: 'Link', title: 'Link (Ctrl+K)', before: '[', after: '](https://)', ph: 'text' },
  { label: 'Table', title: 'Table', before: '\n| Column | Column |\n| --- | --- |\n| ', after: ' | |\n', ph: 'Cell' },
  { label: 'ℹ Panel', title: 'Info panel', before: '\n::: info\n', after: '\n:::\n', ph: 'Note' },
]

export function PageEditor({
  spaceId,
  pageId,
  initialTitle,
  initialMarkdown,
  etag,
  isRoot,
  pageDir,
  pageIds,
}: {
  spaceId: number
  pageId: number
  initialTitle: string
  initialMarkdown: string
  etag: string | null
  isRoot: boolean
  pageDir: string
  pageIds: number[]
}) {
  const goFresh = useGoFresh()
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle === 'Untitled page' ? '' : initialTitle)
  const [md, setMd] = useState(initialMarkdown)
  const [mode, setMode] = useState<Mode>('visual')
  const rich = useRef<RichEditorHandle>(null)
  const [richDirty, setRichDirty] = useState(false)
  // Remembered per browser; read after mount so server and client render the same.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY) as Mode | null
      if (saved && MODES.includes(saved)) setMode(saved)
    } catch {
      /* storage unavailable */
    }
  }, [])
  const switchMode = (next: Mode) => {
    if (next === mode) return
    // Leaving the visual editor: its document becomes the Markdown source (if it was edited;
    // otherwise keep the original text so an untouched page isn't reformatted).
    if (mode === 'visual' && rich.current?.isDirty()) setMd(rich.current.getMarkdown())
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      /* storage unavailable */
    }
  }
  const currentMarkdown = () => (mode === 'visual' && rich.current ? rich.current.getMarkdown() : md)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [pending, start] = useTransition()
  const ta = useRef<HTMLTextAreaElement>(null)
  const pane = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const uploadChain = useRef<Promise<unknown>>(Promise.resolve())

  /**
   * Uploads files to the page's attachments folder and puts a Markdown
   * reference at the cursor: a placeholder while uploading, then an image or
   * a file link.
   */
  const attach = (files: File[]) => {
    const el = ta.current
    const value = el?.value ?? md
    let at = el ? el.selectionEnd : value.length
    // Start after a blank line (otherwise an image lands inside the current paragraph or list item).
    const before = value.slice(0, at)
    let lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    for (const raw of files) {
      const file =
        raw.name && raw.name !== 'image.png' ? raw : new File([raw], `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.png`, { type: raw.type })
      const placeholder = `![Uploading ${file.name}…](#upload-${Math.random().toString(36).slice(2)})`
      const text = `${lead}${placeholder}\n`
      lead = ''
      const pos = at
      setMd((cur) => cur.slice(0, pos) + text + cur.slice(pos))
      at += text.length
      setUploading((n) => n + 1)
      // One at a time (see useUploadQueue).
      uploadChain.current = uploadChain.current
        .then(() => uploadWithProgress<{ name: string; href: string }>(`/api/attachments/page/${spaceId}/${pageId}`, file, () => undefined))
        .then((r) => {
          const ref = isImageName(r.name) ? `![${r.name}](${r.href})` : `[${r.name}](${r.href})`
          setMd((cur) => cur.replace(placeholder, ref))
        })
        .catch((err: unknown) => {
          setMd((cur) => cur.replace(`${placeholder}\n`, '').replace(placeholder, ''))
          setError(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`)
        })
        .finally(() => setUploading((n) => n - 1))
    }
  }
  const dragging = useFileDrop(pane, attach, mode !== 'visual')

  /** Visual editor uploads: same endpoint, one at a time. */
  const uploadForVisual = useCallback(
    (file: File) => {
      const next = uploadChain.current.then(() => uploadWithProgress<UploadedFile>(`/api/attachments/page/${spaceId}/${pageId}`, file, () => undefined))
      uploadChain.current = next.catch(() => undefined)
      return next
    },
    [spaceId, pageId],
  )
  const dirty = richDirty || md !== initialMarkdown || (title || 'Untitled page') !== initialTitle
  const savedRef = useRef(false)

  const opts = useMemo(() => collectiveLinkOptions(spaceId, pageDir, new Set(pageIds)), [spaceId, pageDir, pageIds])
  const preview = useMarkdownHtml(md, opts)

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty && !savedRef.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = useCallback(
    (force = false) => {
      setError(null)
      // Nothing changed: don't rewrite the file (it would only reformat it), just close.
      // (The visual editor only knows changes made since it loaded; edits made in Markdown mode are in md.)
      const changed = (mode === 'visual' && Boolean(rich.current?.isDirty())) || md !== initialMarkdown || (title || 'Untitled page') !== initialTitle
      if (!changed && !force) {
        savedRef.current = true
        router.push(`/spaces/${spaceId}/pages/${pageId}`)
        return
      }
      start(async () => {
        const r = await savePage(spaceId, pageId, { title: isRoot ? initialTitle : title.trim() || 'Untitled page', markdown: currentMarkdown(), etag, force })
        if (!r.ok) return setError(r.error)
        if (r.data.conflict) return setConflict(true)
        savedRef.current = true
        goFresh(`/spaces/${spaceId}/pages/${r.data.id}`)
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spaceId, pageId, isRoot, initialTitle, title, md, etag, goFresh, mode, dirty, router],
  )

  const apply = (tool: (typeof TOOLS)[number]) => {
    const el = ta.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    const selected = value.slice(s, e) || tool.ph || ''
    let insert: string
    if (tool.line) {
      insert = selected
        .split('\n')
        .map((l) => tool.before + l)
        .join('\n')
      if (s > 0 && value[s - 1] !== '\n') insert = '\n' + insert
    } else insert = tool.before + selected + (tool.after ?? '')
    const next = value.slice(0, s) + insert + value.slice(e)
    setMd(next)
    requestAnimationFrame(() => {
      el.focus()
      const start = s + insert.indexOf(selected)
      el.setSelectionRange(start, start + selected.length)
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key === 's') {
      e.preventDefault()
      save()
    } else if (mod && e.key === 'b') {
      e.preventDefault()
      apply(TOOLS[2])
    } else if (mod && e.key === 'i') {
      e.preventDefault()
      apply(TOOLS[3])
    } else if (mod && e.key === 'k') {
      e.preventDefault()
      apply(TOOLS[10])
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget
      const { selectionStart: s, selectionEnd: end } = el
      setMd(md.slice(0, s) + '  ' + md.slice(end))
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
    }
  }

  return (
    <div className="editor-page">
      <div className="editor-bar">
        <div className="segmented" role="tablist" aria-label="Editor">
          <button role="tab" aria-selected={mode === 'visual'} className={mode === 'visual' ? 'is-active' : ''} onClick={() => switchMode('visual')}>
            Visual
          </button>
          <button
            role="tab"
            aria-selected={mode !== 'visual'}
            className={mode !== 'visual' ? 'is-active' : ''}
            onClick={() => switchMode(mode === 'visual' ? 'split' : mode)}
          >
            Markdown
          </button>
        </div>
        {mode !== 'visual' && (
          <div className="editor-tools" role="toolbar" aria-label="Formatting">
            <button type="button" className="tool-btn" title="Attach files or images" onClick={() => fileInput.current?.click()} disabled={mode === 'preview'}>
              <Icon name="paperclip" size={14} /> Attach
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                e.target.value = ''
                attach(files)
              }}
            />
            <span className="tool-sep" />
            {TOOLS.map((t) => (
              <button key={t.label} type="button" className="tool-btn" title={t.title} onClick={() => apply(t)} disabled={mode === 'preview'}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="editor-actions">
          {mode !== 'visual' && (
            <div className="segmented" role="tablist" aria-label="View">
              {(['write', 'split', 'preview'] as Mode[]).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'is-active' : ''} onClick={() => switchMode(m)}>
                  {m === 'write' ? 'Write' : m === 'split' ? 'Split' : 'Preview'}
                </button>
              ))}
            </div>
          )}
          <button
            className="btn btn-subtle"
            onClick={() => {
              if (dirty && !confirm('Discard your changes?')) return
              savedRef.current = true
              router.push(`/spaces/${spaceId}/pages/${pageId}`)
            }}
          >
            Close
          </button>
          <button
            className="btn btn-primary"
            onClick={() => save()}
            disabled={pending || uploading > 0}
            title={uploading ? 'Waiting for uploads to finish' : undefined}
          >
            {pending ? 'Saving…' : uploading ? 'Uploading…' : 'Update'}
          </button>
        </div>
      </div>
      {error && <div className="banner banner-error editor-banner">{error}</div>}
      {mode === 'visual' ? (
        <div className="editor-body mode-visual">
          <div className="visual-pane">
            <input
              className="editor-title"
              placeholder="Give this page a title"
              value={isRoot ? initialTitle : title}
              disabled={isRoot}
              title={isRoot ? 'The overview page is named after the space' : undefined}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus={!title}
            />
            <RichEditor
              ref={rich}
              initialMarkdown={md}
              autoFocus={Boolean(title)}
              resolveSrc={opts.image}
              upload={uploadForVisual}
              onDirtyChange={setRichDirty}
              onUploadingChange={setUploading}
              onError={setError}
              onSubmit={() => save()}
            />
          </div>
        </div>
      ) : (
        <div className={`editor-body mode-${mode}`}>
          <div className="editor-pane" ref={pane}>
            {dragging && (
              <div className="drop-overlay">
                <Icon name="paperclip" size={28} />
                Drop to attach and insert at the cursor
              </div>
            )}
            <input
              className="editor-title"
              placeholder="Give this page a title"
              value={isRoot ? initialTitle : title}
              disabled={isRoot}
              title={isRoot ? 'The overview page is named after the space' : undefined}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus={!title}
            />
            <textarea
              ref={ta}
              className="editor-textarea"
              value={md}
              onChange={(e) => setMd(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files)
                if (!files.length) return
                e.preventDefault()
                attach(files)
              }}
              placeholder={'Start writing… Markdown is supported.\n\n## Heading\n- list item\n- [ ] task'}
              spellCheck
              autoFocus={Boolean(title)}
            />
          </div>
          <div className="preview-pane">
            <h1 className="page-title">{(isRoot ? initialTitle : title) || 'Untitled page'}</h1>
            <div className="prose" dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        </div>
      )}
      {conflict && (
        <Modal
          title="This page changed in Nextcloud"
          onClose={() => setConflict(false)}
          footer={
            <>
              <button className="btn btn-subtle" onClick={() => setConflict(false)}>
                Keep editing
              </button>
              <button
                className="btn btn-default"
                onClick={() => {
                  savedRef.current = true
                  router.push(`/spaces/${spaceId}/pages/${pageId}`)
                }}
              >
                Discard mine
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setConflict(false)
                  save(true)
                }}
              >
                Overwrite
              </button>
            </>
          }
        >
          <p>Someone saved this page after you started editing. Overwriting replaces their changes with yours.</p>
          <p className="muted small">
            <Icon name="page" size={12} /> Tip: copy your text before discarding.
          </p>
        </Modal>
      )}
    </div>
  )
}
