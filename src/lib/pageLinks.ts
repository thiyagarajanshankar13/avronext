import type { RenderOptions } from './markdown'

/**
 * Rewrites Collectives Markdown for AvroNext:
 * - links carrying `fileId=<page id>` (how Nextcloud Text links pages) open the page here;
 * - relative image paths (`.attachments.<id>/x.png`) go through the authenticated files proxy.
 */
export function collectiveLinkOptions(collectiveId: number, pageDir: string, pageIds: Set<number>): RenderOptions {
  const isAbsolute = (href: string) => /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href)
  /** A path relative to the page's folder → our authenticated file proxy. */
  const proxied = (href: string) => {
    let rel = href.split(/[?#]/)[0]
    try {
      rel = decodeURIComponent(rel)
    } catch {
      /* keep as-is */
    }
    const parts: string[] = pageDir.split('/').filter(Boolean)
    for (const seg of rel.split('/')) {
      if (!seg || seg === '.') continue
      if (seg === '..') parts.pop()
      else parts.push(seg)
    }
    return `/api/files?path=${encodeURIComponent(parts.join('/'))}`
  }
  return {
    link(href) {
      const fileId = Number(href.match(/[?&]fileId=(\d+)/)?.[1])
      if (fileId && pageIds.has(fileId)) return `/spaces/${collectiveId}/pages/${fileId}`
      // Relative links to attached files (not to other pages' .md files).
      if (!isAbsolute(href) && !/\.md(?:$|[?#])/i.test(href)) return proxied(href)
      return href
    },
    image(src) {
      return isAbsolute(src) ? src : proxied(src)
    },
  }
}
