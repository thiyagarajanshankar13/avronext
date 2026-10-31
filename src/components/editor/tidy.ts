/**
 * Small clean-ups on the editor's Markdown output so saves don't add noise
 * (all outside fenced code):
 * - empty paragraphs, which the serializer writes as `&nbsp;` lines, are
 *   dropped: Markdown can't store them and Nextcloud would show the entity;
 * - no runs of blank lines (the table serializer adds one);
 * - exactly one trailing newline.
 */
export function tidyMarkdown(md: string): string {
  const parts = md.split(/(^```[^\n]*\n[\s\S]*?^```[ \t]*$)/m)
  const out = parts.map((part, i) => (i % 2 === 1 ? part : part.replace(/^&nbsp;[ \t]*$/gm, '').replace(/\n{3,}/g, '\n\n'))).join('')
  return out.replace(/^\n+/, '').replace(/\s*$/, '\n')
}
