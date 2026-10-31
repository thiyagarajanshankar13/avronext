/**
 * Checks that the WYSIWYG editor's document model round-trips Markdown:
 * load a page into it and save it back, and the page must render the same and
 * a second save must change nothing. Run: npm run check:markdown
 */
import { MarkdownManager } from '@tiptap/markdown'
import { contentExtensions } from '../src/components/editor/extensions'
import { tidyMarkdown } from '../src/components/editor/tidy'
import { renderMarkdown } from '../src/lib/markdown'

const SAMPLES: Record<string, string> = {
  basics: `# Title

Some **bold**, *italic*, ~~struck~~, \`code\` and a [link](https://example.com "Example").
Line two of the same paragraph.

## Lists

- one
- two
  - nested
  - nested 2
- three

1. first
2. second
3. third

---

> A quote
> over two lines

Hard break follows  
next line.
`,
  tasks: `## Open questions

- [x] Do we keep the monolith's auth?
- [ ] Move search to its own cluster?
`,
  table: `| Service | Owner | Language |
| --- | --- | --- |
| Gateway | Platform | Go |
| Billing | Payments | TypeScript |
| Search | Discovery | Rust |
`,
  code: '```bash\nkubectl -n prod rollout status deploy/gateway\n```\n\nInline `a | b` code.\n',
  callouts: `::: info
This page is the source of truth for **service boundaries**.
:::

::: warn
Never deploy on Fridays.

- even small fixes
- really
:::

::: success
Done!
:::

::: error
Broken.
:::
`,
  attachments: `Start with the [Architecture](Architecture.md?fileId=76) page.

![mockup.png](.attachments.77/mockup.png)

[spec sheet (2).pdf](.attachments.77/spec%20sheet%20%282%29.pdf)

![report.pdf](.attachments.77/report.pdf)

Inline ![icon](.attachments.77/icon%20small.png) in text.
`,
  emoji: 'Welcome to the team! 👋\n\nÜmlauts, ünïcödé and “quotes”.\n',
  escapes: 'Not *emphasis*: \\*literal stars\\* and 2 \\* 3, a_b_c, file_name.md\n',
  ordered_start: '3. three\n4. four\n',
  headings: '# H1\n\n## H2\n\n### H3\n\n#### H4\n',
}

// Empty paragraphs (Enter pressed twice) must not reach the file as "&nbsp;".
{
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }, { type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] }
  const md = tidyMarkdown(new MarkdownManager({ extensions: contentExtensions() }).serialize(doc))
  if (md !== 'a\n\nb\n') {
    console.log('FAIL empty paragraphs: ' + JSON.stringify(md))
    process.exit(1)
  }
  console.log('ok   empty paragraphs dropped')
}

const normalise = (html: string) => html.replace(/\s+/g, ' ').replace(/> </g, '><').trim()

const manager = new MarkdownManager({ extensions: contentExtensions() })
const roundTrip = (md: string) => tidyMarkdown(manager.serialize(manager.parse(md)))

let failed = 0
for (const [name, md] of Object.entries(SAMPLES)) {
  const once = roundTrip(md)
  const twice = roundTrip(once)
  const same = normalise(renderMarkdown(md).html) === normalise(renderMarkdown(once).html)
  const stable = once === twice
  if (same && stable) {
    console.log(`ok   ${name}`)
    continue
  }
  failed++
  console.log(`FAIL ${name}${same ? '' : ' (renders differently)'}${stable ? '' : ' (not stable)'}`)
  console.log('--- original\n' + md + '\n--- after one save\n' + once + (stable ? '' : '\n--- after two saves\n' + twice))
  if (!same) console.log('--- html before\n' + normalise(renderMarkdown(md).html) + '\n--- html after\n' + normalise(renderMarkdown(once).html))
}
console.log(failed ? `\n${failed} sample(s) changed` : '\nall samples round-trip')
process.exit(failed ? 1 : 0)
