'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Small dropdown: a trigger button + a floating panel that closes on outside click / Escape.
 * `floating` renders the panel at the end of <body>, positioned against the viewport, so
 * no container can clip or cover it (e.g. a note card in the column layout); it opens
 * upwards when there's no room below and closes when the page scrolls.
 */
export function Menu({
  trigger,
  children,
  align = 'left',
  className = '',
  label,
  floating = false,
}: {
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
  label?: string
  floating?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  // Close when a menu item navigates somewhere.
  const pathname = usePathname()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onScroll = (e: Event) => floating && !panel.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, floating])

  // Floating: place the panel next to the trigger, inside the viewport.
  useLayoutEffect(() => {
    if (!open || !floating) return setPos(null)
    const t = ref.current?.getBoundingClientRect()
    const p = panel.current
    if (!t || !p) return
    const w = p.offsetWidth
    const h = p.offsetHeight
    const below = window.innerHeight - t.bottom - 8
    const top = below >= h || t.top < h + 8 ? Math.min(t.bottom + 4, window.innerHeight - h - 8) : t.top - h - 4
    const left = align === 'right' ? t.right - w : t.left
    setPos({ position: 'fixed', top: Math.max(8, top), left: Math.max(8, Math.min(left, window.innerWidth - w - 8)), right: 'auto', bottom: 'auto' })
  }, [open, floating, align])

  return (
    <div className={`menu ${className}`} ref={ref}>
      <button type="button" className="menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      {open &&
        (floating
          ? createPortal(
              <>
                {/* Phones show menus as bottom sheets over a backdrop (hidden on larger screens). */}
                <div className="menu-backdrop" onClick={() => setOpen(false)} />
                {/* Clicks inside stay with the menu's owner (e.g. don't open the note behind it). */}
                <div
                  ref={panel}
                  className={`menu-panel menu-${align} menu-floating ${className}-panel`}
                  role="menu"
                  // Hidden for the first frame while it's measured.
                  style={pos ?? { position: 'fixed', visibility: 'hidden', top: 0, left: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {children(() => setOpen(false))}
                </div>
              </>,
              document.body,
            )
          : (
              <>
                <div className="menu-backdrop" onClick={() => setOpen(false)} />
                <div className={`menu-panel menu-${align}`} role="menu">
                  {children(() => setOpen(false))}
                </div>
              </>
            ))}
    </div>
  )
}
