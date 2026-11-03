'use client'
import { useEffect, useRef, useState } from 'react'

const COLORS = ['#0c66e4', '#1f845a', '#6e5dc6', '#c25100', '#ae2e24', '#227d9b', '#943d73', '#5b7f24']

function colorFor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

/**
 * User avatar: two-letter initials on a colour of their own, with the photo from
 * Nextcloud (proxied) on top once it has loaded. People who never uploaded one
 * keep the initials (the proxy refuses Nextcloud's generated letter pictures).
 */
export function Avatar({ uid, name, size = 24, title }: { uid: string; name?: string; size?: number; title?: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading')
  const img = useRef<HTMLImageElement>(null)
  const label = name || uid
  // A cached image can finish loading before React attaches onLoad.
  useEffect(() => {
    const el = img.current
    if (el?.complete) setState(el.naturalWidth ? 'loaded' : 'failed')
  }, [])
  return (
    <span
      className="avatar avatar-initials"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)), background: colorFor(uid) }}
      title={title ?? label}
      role="img"
      aria-label={label}
    >
      {initials(label)}
      {state !== 'failed' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          className={`avatar-img${state === 'loaded' ? ' is-loaded' : ''}`}
          src={`/api/avatar/${encodeURIComponent(uid)}?size=${size > 32 ? 128 : 64}`}
          alt=""
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      )}
    </span>
  )
}

export function AvatarStack({ users, size = 24, max = 3 }: { users: { uid: string; displayname: string }[]; size?: number; max?: number }) {
  const shown = users.slice(0, max)
  const extra = users.length - shown.length
  return (
    <span className="avatar-stack">
      {shown.map((u) => (
        <Avatar key={u.uid} uid={u.uid} name={u.displayname} size={size} />
      ))}
      {extra > 0 && (
        <span className="avatar avatar-initials avatar-more" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
          +{extra}
        </span>
      )}
    </span>
  )
}
