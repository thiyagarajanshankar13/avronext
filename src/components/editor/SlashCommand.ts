import { Extension, type Editor, type Range } from '@tiptap/core'
import { Suggestion, type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'

export type SlashItem = {
  title: string
  hint: string
  keywords: string
  icon: string
  run: (editor: Editor, range: Range) => void
}

export type SlashState = {
  items: SlashItem[]
  rect: DOMRect | null
  select: (item: SlashItem) => void
} | null

type Options = {
  items: (query: string) => SlashItem[]
  /** Called with the popup's state (null = closed); the React component renders it. */
  onState: (state: SlashState) => void
  /** Arrow/Enter/Escape while open; return true when handled. */
  onKeyDown: (event: KeyboardEvent) => boolean
}

/** "/" command menu (Confluence/Notion style), rendered by RichEditor. */
export const SlashCommand = Extension.create<Options>({
  name: 'slashCommand',

  addOptions() {
    return { items: () => [], onState: () => undefined, onKeyDown: () => false }
  },

  addProseMirrorPlugins() {
    const opts = this.options
    const toState = (p: SuggestionProps<SlashItem, SlashItem>): SlashState => ({
      items: p.items,
      rect: p.clientRect?.() ?? null,
      select: (item) => p.command(item),
    })
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        // Not inside code, and only after a space or at the start of a line (so URLs like a/b don't trigger it).
        allowedPrefixes: [' ', ' '],
        allow: ({ editor }) => !editor.isActive('codeBlock') && !editor.isActive('code'),
        items: ({ query }) => opts.items(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => ({
          onStart: (p) => opts.onState(toState(p)),
          onUpdate: (p) => opts.onState(toState(p)),
          onExit: () => opts.onState(null),
          onKeyDown: ({ event }: SuggestionKeyDownProps) => opts.onKeyDown(event),
        }),
      }),
    ]
  },
})
