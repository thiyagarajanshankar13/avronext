import { Node, mergeAttributes } from '@tiptap/core'

export const CALLOUT_TYPES = ['info', 'success', 'warn', 'error'] as const
export type CalloutType = (typeof CALLOUT_TYPES)[number]

const normalise = (t: string | undefined): CalloutType =>
  t === 'warning' ? 'warn' : t === 'danger' ? 'error' : (CALLOUT_TYPES as readonly string[]).includes(t ?? '') ? (t as CalloutType) : 'info'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the selection in a callout, or change the type of the one it's in. */
      setCallout: (type: CalloutType) => ReturnType
      /** Lift the selection out of its callout. */
      unsetCallout: () => ReturnType
      /** Start a new callout around the current block, even inside another one (splits it). */
      insertCallout: (type: CalloutType) => ReturnType
    }
  }
}

/**
 * Nextcloud Text's callout panel, stored in Markdown as
 *
 *   ::: info
 *   Content…
 *   :::
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (el) => normalise(el.getAttribute('data-callout') ?? undefined),
        renderHTML: (attrs) => ({ 'data-callout': attrs.type }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: `callout callout-${node.attrs.type}` }), 0]
  },

  addCommands() {
    return {
      setCallout:
        (type) =>
        ({ commands, editor }) =>
          editor.isActive('callout') ? commands.updateAttributes('callout', { type }) : commands.wrapIn('callout', { type }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift('callout'),
      insertCallout:
        (type) =>
        ({ chain, editor }) =>
          (editor.isActive('callout') ? chain().lift('callout') : chain()).wrapIn('callout', { type }).run(),
    }
  },

  addKeyboardShortcuts() {
    /** True when the cursor is in an empty paragraph directly inside a callout (first or last child). */
    const emptyIn = (where: 'last' | 'first') => {
      const { selection } = this.editor.state
      const { $from, empty } = selection
      if (!empty || $from.depth < 2) return false
      const para = $from.parent
      const box = $from.node(-1)
      if (para.type.name !== 'paragraph' || box.type.name !== 'callout') return false
      if (where === 'first') return $from.parentOffset === 0 && $from.index(-1) === 0
      return para.content.size === 0 && $from.index(-1) === box.childCount - 1 && box.childCount > 1
    }
    return {
      // Enter on an empty last line leaves the panel, like it does in lists.
      Enter: () => emptyIn('last') && this.editor.commands.lift('callout'),
      // Backspace at the very start unwraps the first block.
      Backspace: () => emptyIn('first') && this.editor.commands.lift('callout'),
    }
  },

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src: string) => src.match(/^:::[ \t]*\w/m)?.index ?? -1,
    tokenize(src, _tokens, lexer) {
      const open = src.match(/^:::[ \t]*(\w+)[ \t]*\n/)
      if (!open) return undefined
      // Find the matching closing ":::" (callouts can nest).
      const lines = src.slice(open[0].length).split('\n')
      let depth = 1
      let consumed = 0
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (/^:::[ \t]*\w/.test(line)) depth++
        else if (/^:::[ \t]*$/.test(line)) depth--
        if (depth === 0) {
          const body = lines.slice(0, i).join('\n')
          consumed = open[0].length + lines.slice(0, i + 1).join('\n').length
          return {
            type: 'callout',
            raw: src.slice(0, consumed),
            calloutType: normalise(open[1]),
            tokens: lexer.blockTokens(body),
          }
        }
      }
      return undefined
    },
  },

  parseMarkdown(token, h) {
    const content = h.parseChildren(token.tokens ?? [])
    return h.createNode('callout', { type: normalise(token.calloutType as string) }, content.length ? content : [h.createNode('paragraph')])
  },

  renderMarkdown(node, h) {
    return `::: ${normalise(node.attrs?.type)}\n${h.renderChildren(node.content ?? [], '\n\n')}\n:::`
  },
})
