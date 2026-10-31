import { Icon } from './Icon'

export function AppMissing({ app, detail }: { app: 'Deck' | 'Collectives'; detail: string }) {
  return (
    <div className="empty-state">
      <Icon name={app === 'Deck' ? 'board' : 'book'} size={40} />
      <h2>{app === 'Deck' ? 'Projects need Nextcloud Deck' : 'Spaces need Nextcloud Collectives'}</h2>
      <p className="muted">{detail}</p>
      <p className="muted small">Ask your Nextcloud administrator to install and enable the {app} app.</p>
    </div>
  )
}
