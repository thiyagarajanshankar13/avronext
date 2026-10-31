/** Colour theme preference, kept in a plain cookie (read by the root layout, written by the profile menu). */
export type ThemePref = 'light' | 'dark' | 'system'
export const THEME_COOKIE = 'avronext_theme'
export const parseTheme = (v: string | undefined): ThemePref => (v === 'light' || v === 'dark' ? v : 'system')

/**
 * Runs in <head> before the page paints: resolves "system" from the OS setting
 * (and follows it when it changes), so there's no flash of the wrong theme.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,m=matchMedia('(prefers-color-scheme: dark)');function a(){if(d.dataset.themePref==='system')d.dataset.theme=m.matches?'dark':'light'}a();m.addEventListener('change',a)})()`
