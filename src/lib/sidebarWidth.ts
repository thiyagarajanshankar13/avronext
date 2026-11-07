/** The space sidebar's width, chosen by dragging its edge; kept in a cookie (a preference, like the theme). */
export const SIDEBAR_COOKIE = 'avronext_sidebar_w'
export const SIDEBAR_DEFAULT = 240
export const SIDEBAR_MIN = 180
export const SIDEBAR_MAX = 520

/** The saved width as a CSS value, or undefined for the default. */
export function sidebarWidth(cookie: string | undefined): string | undefined {
  const n = Number(cookie)
  if (!Number.isFinite(n) || n === SIDEBAR_DEFAULT) return undefined
  return `${Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(n)))}px`
}
