import { Icon } from './Icon'

const WHAT = {
  Deck: { icon: 'board', title: 'Projects need Nextcloud Deck' },
  Collectives: { icon: 'book', title: 'Spaces need Nextcloud Collectives' },
  Mail: { icon: 'mail', title: 'Mail needs Nextcloud Mail' },
} as const

export function AppMissing({ app, detail }: { app: keyof typeof WHAT; detail: string }) {
  return (
    <div className="empty-state">
      <Icon name={WHAT[app].icon} size={40} />
      <h2>{WHAT[app].title}</h2>
      <p className="muted">{detail}</p>
      <p className="muted small">Ask your Nextcloud administrator to install and enable the {app} app.</p>
    </div>
  )
}
