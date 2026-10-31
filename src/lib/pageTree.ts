export type PageLite = { id: number; title: string; emoji: string | null; parentId: number; subpageOrder: number[]; slug?: string }
export type TreeNode = PageLite & { children: TreeNode[] }

/** Builds the Collectives page tree: the landing page (parentId 0) is the root. */
export function buildTree(pages: PageLite[]): TreeNode | null {
  const nodes = new Map<number, TreeNode>(pages.map((p) => [p.id, { ...p, children: [] }]))
  let root: TreeNode | null = null
  for (const node of nodes.values()) {
    if (node.parentId === 0) root ??= node
    else nodes.get(node.parentId)?.children.push(node)
  }
  for (const node of nodes.values()) {
    const order = new Map(node.subpageOrder.map((id, i) => [id, i]))
    node.children.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.title.localeCompare(b.title))
  }
  return root
}

/** Root → … → page (excluding the page itself). */
export function ancestors(pages: PageLite[], pageId: number): PageLite[] {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const out: PageLite[] = []
  let cur = byId.get(pageId)
  while (cur && cur.parentId && byId.has(cur.parentId)) {
    cur = byId.get(cur.parentId)!
    out.unshift(cur)
  }
  return out
}

export const toLite = (p: PageLite): PageLite => ({ id: p.id, title: p.title, emoji: p.emoji, parentId: p.parentId, subpageOrder: p.subpageOrder ?? [], slug: p.slug })
