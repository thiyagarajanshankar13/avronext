/** Jira-style project key from a Deck board title: "Marketing Launch" → "ML", "Website" → "WEB". */
export function projectKey(title: string): string {
  const words = title
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'PRJ'
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export const issueKey = (boardTitle: string, cardId: number) => `${projectKey(boardTitle)}-${cardId}`
