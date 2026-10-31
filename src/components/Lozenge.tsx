export type LozengeTone = 'default' | 'inprogress' | 'success' | 'removed' | 'new' | 'moved'

export function Lozenge({ tone = 'default', children }: { tone?: LozengeTone; children: React.ReactNode }) {
  return <span className={`lozenge lozenge-${tone}`}>{children}</span>
}
