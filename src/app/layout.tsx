import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { parseTheme, THEME_COOKIE, THEME_SCRIPT } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'AvroNext', template: '%s · AvroNext' },
  description: 'Projects and spaces for your Nextcloud.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1d2125' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pref = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return (
    // "system" gets its data-theme from THEME_SCRIPT, hence suppressHydrationWarning.
    <html lang="en" data-theme-pref={pref} data-theme={pref === 'system' ? undefined : pref} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
