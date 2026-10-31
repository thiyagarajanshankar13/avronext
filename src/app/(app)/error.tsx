'use client'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="main">
      <div className="empty-state">
        <h2>Something went wrong</h2>
        <p className="muted">{error.message || 'AvroNext could not load this from Nextcloud.'}</p>
        <button className="btn btn-default" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  )
}
