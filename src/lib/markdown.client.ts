'use client'
import DOMPurify from 'dompurify'
import { useEffect, useMemo, useState } from 'react'
import { ALLOWED_ATTR, ALLOWED_TAGS, renderMarkdown, type RenderOptions } from './markdown'

export function markdownToSafeHtmlClient(md: string, opts?: RenderOptions): string {
  const { html } = renderMarkdown(md, opts)
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [...ALLOWED_ATTR, 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|#|\.{0,2}\/?[^:]*$)/i,
  })
}

/**
 * Sanitised HTML for use in client components. DOMPurify needs a DOM, so this
 * is empty during server rendering and fills in once mounted.
 */
export function useMarkdownHtml(md: string, opts?: RenderOptions): string {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return useMemo(() => (mounted ? markdownToSafeHtmlClient(md, opts) : ''), [mounted, md, opts])
}
