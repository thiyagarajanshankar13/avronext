'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Small dropdown: a trigger button + a floating panel that closes on outside click / Escape. */
export function Menu({
  trigger,
  children,
  align = 'left',
  className = '',
  label,
}: {
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Close when a menu item navigates somewhere.
  const pathname = usePathname()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className={`menu ${className}`} ref={ref}>
      <button type="button" className="menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      {open && (
        <div className={`menu-panel menu-${align}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
