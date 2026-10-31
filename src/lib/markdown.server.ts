import 'server-only'
import sanitizeHtml from 'sanitize-html'
import { ALLOWED_ATTR, ALLOWED_TAGS, renderMarkdown, type RenderOptions } from './markdown'

export function markdownToSafeHtml(md: string, opts?: RenderOptions) {
  const { html, headings } = renderMarkdown(md, opts)
  const safe = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { '*': ALLOWED_ATTR, a: ['target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    transformTags: {
      // Task list checkboxes are display-only.
      input: (tagName, attribs) => ({ tagName, attribs: { ...attribs, disabled: 'disabled' } }),
      a: (tagName, attribs) =>
        /^https?:/i.test(attribs.href ?? '')
          ? { tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } }
          : { tagName, attribs },
    },
  })
  return { html: safe, headings }
}
