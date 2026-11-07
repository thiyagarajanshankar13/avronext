'use client'
import { useRef } from 'react'
import { SIDEBAR_COOKIE, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN } from '@/lib/sidebarWidth'

const clamp = (w: number) => Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)))

/**
 * Drag handle on a sidebar's right edge (desktop only). Sets --sidebar-w on the
 * surrounding .with-sidebar while dragging and remembers the width in a cookie
 * (a preference, like the theme) so the server renders it next time.
 * Arrow keys nudge it; double-click resets.
 */
export function SidebarResizer() {
  const ref = useRef<HTMLDivElement>(null)
  const layout = () => ref.current?.closest<HTMLElement>('.with-sidebar') ?? null
  const current = () => ref.current?.parentElement?.getBoundingClientRect().width ?? SIDEBAR_DEFAULT
  const apply = (w: number, save: boolean) => {
    const width = clamp(w)
    layout()?.style.setProperty('--sidebar-w', `${width}px`)
    if (ref.current) ref.current.setAttribute('aria-valuenow', String(width))
    if (save) document.cookie = `${SIDEBAR_COOKIE}=${width}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <div
      ref={ref}
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        const startX = e.clientX
        const startW = current()
        const el = e.currentTarget
        el.setPointerCapture(e.pointerId)
        document.body.classList.add('is-resizing')
        const move = (ev: PointerEvent) => apply(startW + ev.clientX - startX, false)
        const up = (ev: PointerEvent) => {
          apply(startW + ev.clientX - startX, true)
          document.body.classList.remove('is-resizing')
          el.removeEventListener('pointermove', move)
          el.removeEventListener('pointerup', up)
          el.removeEventListener('pointercancel', up)
        }
        el.addEventListener('pointermove', move)
        el.addEventListener('pointerup', up)
        el.addEventListener('pointercancel', up)
      }}
      onDoubleClick={() => apply(SIDEBAR_DEFAULT, true)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          apply(current() + (e.key === 'ArrowRight' ? 16 : -16), true)
        }
      }}
    />
  )
}
