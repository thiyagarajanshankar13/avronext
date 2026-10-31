'use client'
import { useState } from 'react'

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

/** User avatar from Nextcloud (proxied), with an initials fallback. */
export function Avatar({ uid, name, size = 24, title }: { uid: string; name?: string; size?: number; title?: string }) {
  const [failed, setFailed] = useState(false)
  const label = name || uid
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }
  if (failed) {
    return (
      <span className="avatar avatar-initials" style={{ ...style, background: colorFor(uid) }} title={title ?? label}>
        {initials(label)}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="avatar"
      style={style}
      src={`/api/avatar/${encodeURIComponent(uid)}?size=${size > 32 ? 128 : 64}`}
      alt={label}
      title={title ?? label}
      onError={() => setFailed(true)}
    />
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
