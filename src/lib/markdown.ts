import { Marked, type Tokens } from 'marked'

/**
 * Markdown → (unsanitised) HTML shared by the server (page view) and the
 * browser (editor preview, issue descriptions). Callers MUST pass the result
 * through a sanitiser: markdown.server.ts or markdown.client.ts.
 */
export type Heading = { id: string; text: string; level: number }

export type RenderOptions = {
  /** Rewrites link targets (e.g. Collectives `?fileId=` links → AvroNext page URLs). */
  link?: (href: string) => string
  /** Rewrites image sources (relative attachment paths → the files proxy). */
  image?: (src: string) => string
}

const CALLOUT = /^:::[ \t]*(info|success|warn|warning|error|danger)?[ \t]*\n([\s\S]*?)\n:::[ \t]*$/gm

/** Nextcloud Text callouts (`::: info … :::`) → panels, like Confluence's info/warning panels. */
function callouts(md: string): string {
  return md.replace(CALLOUT, (_m, kind: string | undefined, body: string) => {
    const k = kind === 'warning' ? 'warn' : kind === 'danger' ? 'error' : kind || 'info'
    return `<div class="callout callout-${k}">\n\n${body}\n\n</div>`
  })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A file served by our proxy (`/api/files?path=…`) that isn't an image: show it as a file chip, not a broken <img>. */
function proxiedFile(href: string): string | null {
  if (!href.startsWith('/api/files?')) return null
  const path = new URLSearchParams(href.slice(href.indexOf('?') + 1)).get('path') ?? ''
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(path)) return null
  return path.split('/').pop() || 'file'
}

function slugify(text: string, used: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section'
  const n = used.get(base) ?? 0
  used.set(base, n + 1)
  return n ? `${base}-${n}` : base
}

export function renderMarkdown(md: string, opts: RenderOptions = {}): { html: string; headings: Heading[] } {
  const headings: Heading[] = []
  const used = new Map<string, number>()
  const marked = new Marked({ gfm: true, breaks: false })
  marked.use({
    walkTokens(token) {
      if (token.type === 'link' && opts.link) (token as Tokens.Link).href = opts.link((token as Tokens.Link).href)
      if (token.type === 'image' && opts.image) (token as Tokens.Image).href = opts.image((token as Tokens.Image).href)
    },
    renderer: {
      // Nextcloud Text embeds every attachment with image syntax, PDFs included.
      image({ href, text }: Tokens.Image) {
        const file = proxiedFile(href)
        if (file === null) return false
        return `<a class="attachment-link" href="${esc(href)}">${esc(text || file)}</a>`
      },
      // Links to attached files get the same file-chip look.
      link(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, { href, title, tokens }: Tokens.Link) {
        if (proxiedFile(href) === null) return false
        return `<a class="attachment-link" href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`
      },
      heading(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, { tokens, depth, text }: Tokens.Heading) {
        const id = slugify(text, used)
        if (depth <= 3) headings.push({ id, text: text.replace(/[*_`~]/g, ''), level: depth })
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
    },
  })
  const html = marked.parse(callouts(md), { async: false }) as string
  return { html, headings }
}

/** Shared allow-list, so server and browser sanitise identically. */
export const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote', 'pre', 'code', 'span', 'div',
  'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup', 'kbd',
  'ul', 'ol', 'li', 'input', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'details', 'summary',
]
export const ALLOWED_ATTR = ['href', 'title', 'src', 'alt', 'id', 'class', 'type', 'checked', 'disabled', 'align', 'start', 'colspan', 'rowspan']
