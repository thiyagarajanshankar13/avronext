import { useId } from 'react'

// The Avrotech A with a "next" chevron (same artwork as app/icon.svg).
export function Logo({ size = 24 }: { size?: number }) {
  const id = useId()
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#46e3fa" />
            <stop offset=".55" stopColor="#1b93f2" />
            <stop offset="1" stopColor="#0a5ed8" />
          </linearGradient>
          <mask id={`${id}m`}>
            <rect width="64" height="64" fill="#fff" />
            <path d="M26 25 34 44H18z" />
            <path d="M12 46 Q28 39 46 30" stroke="#000" strokeWidth="4" fill="none" />
          </mask>
        </defs>
        <rect width="64" height="64" rx="15" fill={`url(#${id}g)`} />
        <path
          d="M24.3 10.5c.8-1.6 2.9-1.6 3.7 0L45 50.5c.7 1.5-.3 3-1.9 3H9c-1.6 0-2.6-1.6-1.9-3z"
          fill="#fff"
          mask={`url(#${id}m)`}
        />
        <path d="M12 46.5 Q28 39 44 31 Q30 42 14 50z" fill="#fff" />
        <path d="M45 24 L55 34 L45 44" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span className="logo-text">AvroNext</span>
    </span>
  )
}
