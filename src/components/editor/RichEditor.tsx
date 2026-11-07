'use client'
import type { Editor, Range } from '@tiptap/core'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { isImageName } from '../attachments/upload'
import { Icon } from '../Icon'
import { CALLOUT_TYPES, type CalloutType } from './Callout'
import { contentExtensions } from './extensions'
import { SlashCommand, type SlashItem, type SlashState } from './SlashCommand'
import { tidyMarkdown } from './tidy'

export type UploadedFile = { name: string; href: string }

export type RichEditorHandle = {
  getMarkdown: () => string
  /** True when the document differs from what was loaded (formatting-only differences don't count). */
  isDirty: () => boolean
  setMarkdown: (markdown: string) => void
  focus: () => void
}

type Props = {
  initialMarkdown: string
  /** Start from HTML instead (e.g. a quoted email); the editor still produces Markdown. */
  initialHtml?: string
  /** 'page' = full toolbar; 'compact' = issue descriptions (no headings 1, tables or panels in the toolbar). */
  variant?: 'page' | 'compact'
  placeholder?: string
  /** Cursor at the start once loaded; `always` also when another field has focus (e.g. a dialog focused its first input). */
  autoFocus?: boolean | 'always'
  /** Display URL for an image's stored src (relative attachment paths → files proxy). */
  resolveSrc?: (src: string) => string
  /** Enables attaching files (button, paste, drop): stores the file and returns its Markdown href. */
  upload?: (file: File) => Promise<UploadedFile>
  /** Whether the document differs from what was loaded (debounced; for "unsaved changes" warnings). */
  onDirtyChange?: (dirty: boolean) => void
  onUploadingChange?: (count: number) => void
  onError?: (message: string) => void
  /** Ctrl/Cmd+Enter or Ctrl/Cmd+S. */
  onSubmit?: () => void
}

const CALLOUT_LABEL: Record<CalloutType, string> = { info: 'Info', success: 'Success', warn: 'Warning', error: 'Error' }

/**
 * Confluence-style WYSIWYG editor that reads and writes Markdown (TipTap +
 * @tiptap/markdown). The document model is limited to what Markdown and
 * Nextcloud's callouts can store; see scripts/markdown-roundtrip.ts.
 */
export const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor(
  { initialMarkdown, initialHtml, variant = 'page', placeholder, autoFocus, resolveSrc, upload, onDirtyChange, onUploadingChange, onError, onSubmit },
  ref,
) {
  const [slash, setSlash] = useState<SlashState>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  // The selection the link applies to, captured when the box opens (focus moving into it collapses the editor's).
  const [linkRange, setLinkRange] = useState<{ from: number; to: number } | null>(null)
  const openLink = () => {
    const ed = editorRef.current
    if (!ed) return
    // Prefer the browser's selection: right after a Shift+Arrow the editor may not have caught up yet.
    let { from, to } = ed.state.selection
    const sel = window.getSelection()
    if (sel?.anchorNode && sel.focusNode && ed.view.dom.contains(sel.anchorNode) && ed.view.dom.contains(sel.focusNode)) {
      try {
        const a = ed.view.posAtDOM(sel.anchorNode, sel.anchorOffset)
        const b = ed.view.posAtDOM(sel.focusNode, sel.focusOffset)
        ;[from, to] = [Math.min(a, b), Math.max(a, b)]
      } catch {
        /* keep the editor's selection */
      }
    }
    setLinkRange({ from, to })
  }
  const fileInput = useRef<HTMLInputElement>(null)
  const pending = useRef(0)

  // Latest props/state for ProseMirror callbacks, which are created once.
  const latest = useRef({ slash, slashIndex, upload, onDirtyChange, onUploadingChange, onError, onSubmit })
  latest.current = { slash, slashIndex, upload, onDirtyChange, onUploadingChange, onError, onSubmit }
  const editorRef = useRef<Editor | null>(null)

  // "Dirty" = the Markdown differs from what the editor produced right after loading. (Comparing
  // with the raw input would flag formatting-only differences, and the editor fires updates on
  // load too, e.g. when it normalises tables.)
  const baseline = useRef<string | null>(null)
  const markdownOf = (ed: Editor) => tidyMarkdown(ed.getMarkdown())
  const isDirty = () => {
    const ed = editorRef.current
    return Boolean(ed && baseline.current !== null && markdownOf(ed) !== baseline.current)
  }
  const dirtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (dirtyTimer.current) clearTimeout(dirtyTimer.current)
  }, [])

  const insertFiles = useCallback((files: File[], at?: number) => {
    const ed = editorRef.current
    const up = latest.current.upload
    if (!ed || !up || !files.length) return
    let pos = at ?? ed.state.selection.to
    for (const raw of files) {
      // Pasted screenshots all arrive as "image.png".
      const file =
        raw.name && raw.name !== 'image.png' ? raw : new File([raw], `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.png`, { type: raw.type })
      const marker = `uploading:${Math.random().toString(36).slice(2)}`
      ed.chain()
        .insertContentAt(pos, { type: 'image', attrs: { src: marker, alt: `Uploading ${file.name}…` } })
        .run()
      pos += 1
      pending.current++
      latest.current.onUploadingChange?.(pending.current)
      up(file)
        .then((r) => replaceMarker(marker, r))
        .catch((err: unknown) => {
          replaceMarker(marker, null)
          latest.current.onError?.(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`)
        })
        .finally(() => {
          pending.current--
          latest.current.onUploadingChange?.(pending.current)
        })
    }
  }, [])

  /** Swap an upload placeholder for the image, a file link, or nothing (failed). */
  const replaceMarker = (marker: string, file: UploadedFile | null) => {
    const ed = editorRef.current
    if (!ed) return
    let found = -1
    ed.state.doc.descendants((node, pos) => {
      if (found < 0 && node.type.name === 'image' && node.attrs.src === marker) found = pos
      return found < 0
    })
    if (found < 0) return
    const { tr, schema } = ed.state
    if (!file) tr.delete(found, found + 1)
    else if (isImageName(file.name)) tr.setNodeMarkup(found, undefined, { src: file.href, alt: file.name })
    else tr.replaceWith(found, found + 1, schema.text(file.name, [schema.marks.link.create({ href: file.href })]))
    ed.view.dispatch(tr)
  }

  const slashItems = useMemo(() => buildSlashItems(() => fileInput.current?.click(), Boolean(upload)), [upload])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...contentExtensions({ resolveSrc }),
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? "Type '/' for commands" }),
      SlashCommand.configure({
        items: (q) => {
          const query = q.toLowerCase()
          return slashItems.filter((i) => !query || i.title.toLowerCase().includes(query) || i.keywords.includes(query)).slice(0, 12)
        },
        onState: (s) => {
          setSlash(s)
          setSlashIndex(0)
        },
        onKeyDown: (event) => {
          const { slash: s, slashIndex: i } = latest.current
          if (!s || !s.items.length) return false
          if (event.key === 'ArrowDown') return (setSlashIndex((i + 1) % s.items.length), true)
          if (event.key === 'ArrowUp') return (setSlashIndex((i - 1 + s.items.length) % s.items.length), true)
          if (event.key === 'Enter' || event.key === 'Tab') return (s.select(s.items[i]), true)
          if (event.key === 'Escape') return (setSlash(null), true)
          return false
        },
      }),
    ],
    content: initialHtml ?? initialMarkdown,
    contentType: initialHtml !== undefined ? 'html' : 'markdown',
    editorProps: {
      attributes: { class: `prose rich-content rich-${variant}`, spellcheck: 'true' },
      handleKeyDown: (_view, event) => {
        const mod = event.metaKey || event.ctrlKey
        if (mod && event.key.toLowerCase() === 'k') {
          event.preventDefault()
          openLink()
          return true
        }
        if (mod && (event.key === 's' || event.key === 'Enter') && latest.current.onSubmit) {
          event.preventDefault()
          latest.current.onSubmit()
          return true
        }
        return false
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (!files.length || !latest.current.upload) return false
        event.preventDefault()
        insertFiles(files)
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (moved || !files.length || !latest.current.upload) return false
        event.preventDefault()
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        insertFiles(files, at)
        return true
      },
    },
    onCreate: ({ editor: ed }) => {
      baseline.current = markdownOf(ed)
      // Put the cursor at the start, synchronously and only if nothing has focus yet: a deferred
      // focus could land after the user's first click and move their cursor to the top.
      if (autoFocus === 'always' || (autoFocus && (!document.activeElement || document.activeElement === document.body))) {
        ed.view.focus()
        ed.commands.setTextSelection(1)
      }
    },
    onUpdate: () => {
      if (dirtyTimer.current) clearTimeout(dirtyTimer.current)
      dirtyTimer.current = setTimeout(() => latest.current.onDirtyChange?.(isDirty()), 300)
    },
  })
  editorRef.current = editor

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => (editor ? markdownOf(editor) : initialMarkdown),
      isDirty,
      setMarkdown: (md) => editor?.commands.setContent(md, { contentType: 'markdown', emitUpdate: false }),
      focus: () => editor?.commands.focus(),
    }),
    [editor, initialMarkdown],
  )

  if (!editor) return <div className={`rich-editor rich-editor-${variant} is-loading`} aria-busy="true" />

  return (
    <div className={`rich-editor rich-editor-${variant}`}>
      <Toolbar editor={editor} variant={variant} canUpload={Boolean(upload)} onAttach={() => fileInput.current?.click()} onLink={openLink} />
      {linkRange && <LinkPopover editor={editor} range={linkRange} onClose={() => setLinkRange(null)} />}
      <BubbleMenu
        editor={editor}
        className="bubble-menu"
        shouldShow={({ editor: e, state }) => !state.selection.empty && !e.isActive('image') && !e.isActive('codeBlock')}
      >
        <MarkButtons editor={editor} onLink={openLink} />
      </BubbleMenu>
      <EditorContent editor={editor} className="rich-body" />
      {slash && slash.items.length > 0 && <SlashMenu state={slash} index={slashIndex} onHover={setSlashIndex} />}
      {upload && (
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            insertFiles(files)
          }}
        />
      )}
    </div>
  )
})

function buildSlashItems(pickFile: () => void, canUpload: boolean): SlashItem[] {
  const block = (title: string, hint: string, keywords: string, icon: string, fn: (e: Editor) => void): SlashItem => ({
    title,
    hint,
    keywords,
    icon,
    run: (editor: Editor, range: Range) => {
      editor.chain().focus().deleteRange(range).run()
      fn(editor)
    },
  })
  const items: SlashItem[] = [
    block('Text', 'Plain paragraph', 'paragraph normal p', '¶', (e) => e.chain().focus().setParagraph().run()),
    block('Heading 1', 'Large section heading', 'h1 title', 'H1', (e) => e.chain().focus().setHeading({ level: 1 }).run()),
    block('Heading 2', 'Medium section heading', 'h2 subtitle', 'H2', (e) => e.chain().focus().setHeading({ level: 2 }).run()),
    block('Heading 3', 'Small section heading', 'h3', 'H3', (e) => e.chain().focus().setHeading({ level: 3 }).run()),
    block('Bulleted list', 'Simple list', 'ul bullet unordered', '•', (e) => e.chain().focus().toggleBulletList().run()),
    block('Numbered list', 'List with numbers', 'ol ordered number', '1.', (e) => e.chain().focus().toggleOrderedList().run()),
    block('Task list', 'Checklist with checkboxes', 'todo checkbox action', '☑', (e) => e.chain().focus().toggleTaskList().run()),
    block('Table', '3 × 3 table with a header row', 'grid', '▦', (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
    ...CALLOUT_TYPES.map((t) =>
      block(
        `${CALLOUT_LABEL[t]} panel`,
        'Highlighted note',
        `callout panel note ${t} admonition`,
        { info: 'ℹ', success: '✓', warn: '!', error: '✕' }[t],
        (e) => e.chain().focus().insertCallout(t).run(),
      ),
    ),
    block('Quote', 'Quotation', 'blockquote citation', '“', (e) => e.chain().focus().toggleBlockquote().run()),
    block('Code block', 'Code with syntax', 'pre snippet', '</>', (e) => e.chain().focus().toggleCodeBlock().run()),
    block('Divider', 'Horizontal line', 'hr rule separator', '—', (e) => e.chain().focus().setHorizontalRule().run()),
  ]
  if (canUpload) items.push(block('Image or file', 'Upload and insert', 'image picture attachment file upload', '📎', () => pickFile()))
  return items
}

function SlashMenu({ state, index, onHover }: { state: NonNullable<SlashState>; index: number; onHover: (i: number) => void }) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])
  if (!state.rect) return null
  const below = state.rect.bottom + 320 < window.innerHeight
  const style: React.CSSProperties = {
    left: Math.min(state.rect.left, window.innerWidth - 300),
    ...(below ? { top: state.rect.bottom + 6 } : { bottom: window.innerHeight - state.rect.top + 6 }),
  }
  return (
    <div className="slash-menu" style={style} ref={list} role="listbox" aria-label="Insert">
      {state.items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          data-index={i}
          role="option"
          aria-selected={i === index}
          className={`slash-item${i === index ? ' is-active' : ''}`}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault()
            state.select(item)
          }}
        >
          <span className="slash-icon">{item.icon}</span>
          <span>
            <strong>{item.title}</strong>
            <small>{item.hint}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

function useActive(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      table: e.isActive('table'),
      callout: e.isActive('callout') ? (e.getAttributes('callout').type as CalloutType) : null,
      heading: ([1, 2, 3, 4] as const).find((level) => e.isActive('heading', { level })) ?? 0,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
}

function Btn({ on, title, onClick, disabled, children }: { on?: boolean; title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`tool-btn${on ? ' is-on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      // Keep the editor's selection: don't take focus on mousedown.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function MarkButtons({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const a = useActive(editor)
  const c = () => editor.chain().focus()
  return (
    <>
      <Btn on={a.bold} title="Bold (Ctrl+B)" onClick={() => c().toggleBold().run()}>
        <b>B</b>
      </Btn>
      <Btn on={a.italic} title="Italic (Ctrl+I)" onClick={() => c().toggleItalic().run()}>
        <i>I</i>
      </Btn>
      <Btn on={a.strike} title="Strikethrough" onClick={() => c().toggleStrike().run()}>
        <s>S</s>
      </Btn>
      <Btn on={a.code} title="Inline code" onClick={() => c().toggleCode().run()}>
        {'</>'}
      </Btn>
      <Btn on={a.link} title="Link (Ctrl+K)" onClick={onLink}>
        <Icon name="link" size={14} />
      </Btn>
    </>
  )
}

function Toolbar({
  editor,
  variant,
  canUpload,
  onAttach,
  onLink,
}: {
  editor: Editor
  variant: 'page' | 'compact'
  canUpload: boolean
  onAttach: () => void
  onLink: () => void
}) {
  const a = useActive(editor)
  const c = () => editor.chain().focus()
  const page = variant === 'page'
  return (
    <div className="rich-toolbar" role="toolbar" aria-label="Formatting">
      <select
        className="style-select"
        aria-label="Text style"
        value={a.heading}
        onChange={(e) => {
          const level = Number(e.target.value)
          if (level)
            c()
              .setHeading({ level: level as 1 | 2 | 3 | 4 })
              .run()
          else c().setParagraph().run()
        }}
      >
        <option value={0}>Normal text</option>
        {page && <option value={1}>Heading 1</option>}
        <option value={2}>Heading 2</option>
        <option value={3}>Heading 3</option>
        {page && <option value={4}>Heading 4</option>}
      </select>
      <span className="tool-sep" />
      <MarkButtons editor={editor} onLink={onLink} />
      <span className="tool-sep" />
      <Btn on={a.bullet} title="Bulleted list" onClick={() => c().toggleBulletList().run()}>
        •≡
      </Btn>
      <Btn on={a.ordered} title="Numbered list" onClick={() => c().toggleOrderedList().run()}>
        1≡
      </Btn>
      <Btn on={a.task} title="Task list" onClick={() => c().toggleTaskList().run()}>
        ☑
      </Btn>
      <Btn on={a.quote} title="Quote" onClick={() => c().toggleBlockquote().run()}>
        “
      </Btn>
      <Btn on={a.codeBlock} title="Code block" onClick={() => c().toggleCodeBlock().run()}>
        {'{ }'}
      </Btn>
      {page && (
        <>
          <span className="tool-sep" />
          <Btn on={a.table} title="Insert table" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} disabled={a.table}>
            ▦
          </Btn>
          <select
            className={`style-select callout-select${a.callout ? ' is-on' : ''}`}
            aria-label="Panel"
            value={a.callout ?? ''}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'none') c().unsetCallout().run()
              else if (v)
                c()
                  .setCallout(v as CalloutType)
                  .run()
            }}
          >
            <option value="">{a.callout ? `${CALLOUT_LABEL[a.callout]} panel` : 'Panel…'}</option>
            {CALLOUT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CALLOUT_LABEL[t]} panel
              </option>
            ))}
            {a.callout && <option value="none">Remove panel</option>}
          </select>
          <Btn title="Divider" onClick={() => c().setHorizontalRule().run()}>
            —
          </Btn>
        </>
      )}
      {canUpload && (
        <>
          <span className="tool-sep" />
          <Btn title="Attach an image or file" onClick={onAttach}>
            <Icon name="paperclip" size={14} /> <span className="hide-sm">Attach</span>
          </Btn>
        </>
      )}
      <span className="spacer" />
      <Btn title="Undo (Ctrl+Z)" onClick={() => c().undo().run()} disabled={!a.canUndo}>
        ↶
      </Btn>
      <Btn title="Redo (Ctrl+Shift+Z)" onClick={() => c().redo().run()} disabled={!a.canRedo}>
        ↷
      </Btn>
      {a.table && (
        <div className="table-toolbar" role="toolbar" aria-label="Table">
          <span className="muted small">Table:</span>
          <Btn title="Row above" onClick={() => c().addRowBefore().run()}>
            + Row ↑
          </Btn>
          <Btn title="Row below" onClick={() => c().addRowAfter().run()}>
            + Row ↓
          </Btn>
          <Btn title="Column left" onClick={() => c().addColumnBefore().run()}>
            + Col ←
          </Btn>
          <Btn title="Column right" onClick={() => c().addColumnAfter().run()}>
            + Col →
          </Btn>
          <Btn title="Delete row" onClick={() => c().deleteRow().run()}>
            − Row
          </Btn>
          <Btn title="Delete column" onClick={() => c().deleteColumn().run()}>
            − Col
          </Btn>
          <Btn title="Delete table" onClick={() => c().deleteTable().run()}>
            <Icon name="trash" size={13} />
          </Btn>
        </div>
      )}
    </div>
  )
}

function LinkPopover({ editor, range, onClose }: { editor: Editor; range: { from: number; to: number }; onClose: () => void }) {
  const linkAt = (pos: number) =>
    editor.state.doc
      .resolve(pos)
      .marks()
      .find((m) => m.type.name === 'link')
  const [href, setHref] = useState<string>(() => linkAt(range.from)?.attrs.href ?? '')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const apply = () => {
    const url = href.trim()
    const inLink = Boolean(linkAt(range.from))
    const chain = editor.chain().focus().setTextSelection(range)
    if (!url) chain.extendMarkRange('link').unsetLink().run()
    else if (range.from === range.to && !inLink) {
      chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run()
    } else (range.from === range.to ? chain.extendMarkRange('link') : chain).setLink({ href: url }).run()
    onClose()
  }
  return (
    <div className="link-popover" role="dialog" aria-label="Link">
      <input
        ref={input}
        value={href}
        placeholder="Paste a link: https://…"
        onChange={(e) => setHref(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            apply()
          }
          if (e.key === 'Escape') onClose()
        }}
      />
      <button type="button" className="btn btn-primary btn-sm" onClick={apply}>
        {href.trim() ? 'Apply' : 'Remove'}
      </button>
      <button type="button" className="btn btn-subtle btn-sm" onClick={onClose}>
        Cancel
      </button>
    </div>
  )
}
