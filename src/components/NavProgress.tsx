'use client'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

let start: (() => void) | null = null

/** Starts the bar for navigations that don't come from a link click (router.push after a save). */
export function startNavProgress() {
  start?.()
}

/**
 * Instant feedback while the next screen loads from Nextcloud: a thin bar at
 * the top, and the current screen fades slightly. Starts on any internal link
 * click (capture phase, before next/link handles it), ends when the URL changes.
 *
 * Deliberately not loading.tsx: with loading boundaries, a navigation that
 * interrupts another (or follows a server action) can leave the router stuck
 * on the old screen in this Next.js version.
 */
export function NavProgress() {
  const pathname = usePathname()
  const params = useSearchParams()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const location = `${pathname}?${params.toString()}`

  useEffect(() => {
    start = () => setState('loading')
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a')
      if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      setState('loading')
    }
    document.addEventListener('click', onClick, true)
    return () => {
      start = null
      document.removeEventListener('click', onClick, true)
    }
  }, [])

  // Arrived: finish the bar.
  useEffect(() => setState((s) => (s === 'loading' ? 'done' : s)), [location])

  useEffect(() => {
    document.documentElement.toggleAttribute('data-navigating', state === 'loading')
    if (state === 'done') {
      const t = setTimeout(() => setState('idle'), 250)
      return () => clearTimeout(t)
    }
    if (state === 'loading') {
      // Never leave the bar up if a navigation is cancelled (e.g. same-page link).
      const t = setTimeout(() => setState('idle'), 15000)
      return () => clearTimeout(t)
    }
  }, [state])

  return <div className={`nav-progress nav-progress-${state}`} aria-hidden="true" />
}
