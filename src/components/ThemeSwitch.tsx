'use client'
import { useEffect, useState } from 'react'
import { THEME_COOKIE, type ThemePref } from '@/lib/theme'

const OPTIONS: [ThemePref, string][] = [
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['system', 'System'],
]

/** Light / Dark / System, applied at once and remembered in a cookie for a year. */
export function ThemeSwitch() {
  const [pref, setPref] = useState<ThemePref>('system')
  useEffect(() => setPref((document.documentElement.dataset.themePref as ThemePref) || 'system'), [])

  const choose = (next: ThemePref) => {
    const root = document.documentElement
    root.dataset.themePref = next
    root.dataset.theme = next === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : next
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    setPref(next)
  }

  return (
    <div className="menu-theme">
      <span>Theme</span>
      <div className="segmented" role="radiogroup" aria-label="Theme">
        {OPTIONS.map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={pref === value} className={pref === value ? 'is-active' : ''} onClick={() => choose(value)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
