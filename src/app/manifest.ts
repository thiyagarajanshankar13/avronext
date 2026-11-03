import type { MetadataRoute } from 'next'

/** Makes AvroNext installable (Add to Home Screen / Install app). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'AvroNext',
    short_name: 'AvroNext',
    description: 'Projects, spaces, files and notes for your Nextcloud.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#0c66e4',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press the app icon.
    shortcuts: [
      { name: 'New note', short_name: 'Note', url: '/notes?new=1', icons: [{ src: '/icons/shortcut-note.png', sizes: '96x96' }] },
      { name: 'New issue', short_name: 'Issue', url: '/?create=issue', icons: [{ src: '/icons/shortcut-issue.png', sizes: '96x96' }] },
      { name: 'Upload file', short_name: 'Upload', url: '/files?add=1', icons: [{ src: '/icons/shortcut-upload.png', sizes: '96x96' }] },
      { name: 'My issues', short_name: 'My issues', url: '/', icons: [{ src: '/icons/shortcut-mine.png', sizes: '96x96' }] },
    ],
    // Android share sheet → AvroNext. The service worker keeps what was shared in the
    // browser and opens /share, where the user picks Files, a note or an issue.
    share_target: {
      action: '/share',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'files', accept: ['*/*'] }] },
    },
  }
}
