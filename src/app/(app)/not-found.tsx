import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="main">
      <div className="empty-state">
        <h2>We can’t find that</h2>
        <p className="muted">It may have been deleted, or you may not have access to it in Nextcloud.</p>
        <Link prefetch={false} className="btn btn-default" href="/">
          Go to Your work
        </Link>
      </div>
    </main>
  )
}
