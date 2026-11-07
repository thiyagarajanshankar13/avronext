import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { PWA_SCRIPT } from '@/lib/pwa'
import { parseTheme, THEME_COOKIE, THEME_SCRIPT } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'AvroNext', template: '%s · AvroNext' },
  description: 'Projects and spaces for your Nextcloud.',
  robots: { index: false, follow: false },
  applicationName: 'AvroNext',
  // iPhone/iPad "Add to Home Screen": full screen, with our icon and name.
  appleWebApp: { capable: true, title: 'AvroNext', statusBarStyle: 'default' },
  // Listing icons here replaces Next's automatic app/icon.svg link, so the favicon is listed too
  // (SVG for most browsers, PNG for Safari, which doesn't show SVG favicons).
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  // Use the whole screen on phones with notches; CSS keeps content inside the safe area.
  viewportFit: 'cover',
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
        <script dangerouslySetInnerHTML={{ __html: PWA_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
