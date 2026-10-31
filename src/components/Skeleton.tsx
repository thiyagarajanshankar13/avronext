/** Placeholder blocks for Suspense fallbacks while data streams in from Nextcloud. */
export function Skel({ w = '100%', h = 14, r, className = '' }: { w?: number | string; h?: number; r?: number; className?: string }) {
  return <span className={`skel ${className}`} style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skel-rows">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel-row">
          <Skel w={24} h={24} r={6} />
          <Skel w={`${55 - ((i * 13) % 25)}%`} />
          <span className="spacer" />
          <Skel w={70} h={16} />
        </div>
      ))}
    </div>
  )
}
