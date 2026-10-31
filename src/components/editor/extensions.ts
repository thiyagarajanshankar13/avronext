import type { AnyExtension } from '@tiptap/core'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { AttachmentImage } from './AttachmentImage'
import { Callout } from './Callout'

/**
 * The document model shared by the editor and the Markdown round-trip check:
 * only what Markdown (plus Nextcloud's callouts) can store, so nothing typed
 * in AvroNext gets lost when the page is saved as Markdown.
 */
export function contentExtensions(opts: { resolveSrc?: (src: string) => string } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      // Markdown has no underline.
      underline: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer', target: null } },
      codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    AttachmentImage.configure({ resolveSrc: opts.resolveSrc ?? ((s: string) => s) }),
    Callout,
  ]
}
