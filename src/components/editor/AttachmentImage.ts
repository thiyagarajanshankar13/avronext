import { Image } from '@tiptap/extension-image'

const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:$|[?#])/i

export type ImageOptionsExtra = {
  /** Display URL for a stored src (e.g. `.attachments.12/a.png` → the authenticated files proxy). */
  resolveSrc: (src: string) => string
}

/**
 * Markdown images, inline like Nextcloud Text writes them. The stored `src`
 * is kept exactly as written (relative attachment paths stay relative); only
 * the displayed URL goes through `resolveSrc`. Files that aren't images (Text
 * embeds PDFs with image syntax too) show as a file chip.
 */
export const AttachmentImage = Image.extend<ImageOptionsExtra & ReturnType<NonNullable<typeof Image.config.addOptions>>>({
  addOptions() {
    return { ...this.parent!(), inline: true, allowBase64: false, resolveSrc: (src: string) => src }
  },

  addAttributes() {
    return {
      ...this.parent!(),
      src: {
        default: null,
        // Our own rendering carries the original in data-src; pasted <img> from elsewhere only has src.
        parseHTML: (el) => el.getAttribute('data-src') ?? el.getAttribute('src'),
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]:not([src^="data:"])' }, { tag: 'span[data-src].attachment-link' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const src: string = node.attrs.src ?? ''
    const name = decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() ?? '') || 'file'
    if (!IMAGE.test(src) && !/^(https?:|data:)/i.test(src)) {
      return ['span', { class: 'attachment-link', 'data-src': src, title: node.attrs.alt || name, contenteditable: 'false' }, node.attrs.alt || name]
    }
    return ['img', { ...HTMLAttributes, src: this.options.resolveSrc(src), 'data-src': src, draggable: 'true' }]
  },
})
