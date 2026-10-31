'use client'
import { useState } from 'react'
import { fileKind, previewUrl, type FileKind } from './paths'

const BADGE: Partial<Record<FileKind, [string, string]>> = {
  pdf: ['PDF', '#d93b30'],
  word: ['W', '#2b62c8'],
  sheet: ['X', '#1d8a4e'],
  slides: ['P', '#d4581f'],
  image: ['IMG', '#8a4fd6'],
  video: ['▶', '#c2357a'],
  audio: ['♪', '#0f8b8d'],
  markdown: ['MD', '#44546f'],
  text: ['TXT', '#626f86'],
  archive: ['ZIP', '#946f00'],
}

/** Type glyph: a folder, or a page with a coloured type badge (Word blue, Excel green…). */
export function TypeGlyph({ kind, size = 24, shared = false }: { kind: FileKind; size?: number; shared?: boolean }) {
  if (kind === 'folder')
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="file-glyph">
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h6.4l2.6 3H26.5A2.5 2.5 0 0 1 29 10.5v14a2.5 2.5 0 0 1-2.5 2.5h-21A2.5 2.5 0 0 1 3 24.5z" fill="#e8a317" />
        <path d="M3 11.5A2.5 2.5 0 0 1 5.5 9h21a2.5 2.5 0 0 1 2.5 2.5v13a2.5 2.5 0 0 1-2.5 2.5h-21A2.5 2.5 0 0 1 3 24.5z" fill="#ffc83d" />
        {shared && <path d="M13 21.5c0-2 1.8-3 3-3s3 1 3 3zm3-4a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2" fill="#8a5a00" />}
      </svg>
    )
  const badge = BADGE[kind]
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="file-glyph">
      <path d="M7 2.5h12.5L26 9v20a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 6 29V4A1.5 1.5 0 0 1 7.5 2.5z" fill="var(--file-page, #fff)" stroke="var(--file-page-edge, #b3b9c4)" />
      <path d="M19.5 2.5V8a1 1 0 0 0 1 1H26" fill="none" stroke="var(--file-page-edge, #b3b9c4)" />
      {badge ? (
        <>
          <rect x="2" y="15" width={badge[0].length > 2 ? 22 : 16} height="11" rx="2" fill={badge[1]} />
          <text x={badge[0].length > 2 ? 13 : 10} y="23.3" textAnchor="middle" fontSize={badge[0].length > 2 ? 7 : 8} fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
            {badge[0]}
          </text>
        </>
      ) : (
        <path d="M10 15h12M10 19h12M10 23h8" stroke="var(--file-page-edge, #b3b9c4)" strokeWidth="1.5" />
      )}
    </svg>
  )
}

/** Thumbnail from Nextcloud's preview service when it has one, else the type glyph. */
export function FileIcon({
  item,
  size = 24,
  thumb = 0,
}: {
  item: { id: number; name: string; isDir: boolean; mime: string; hasPreview: boolean; shareTypes?: number[] }
  size?: number
  /** Preview size to ask for; 0 = never use a thumbnail. */
  thumb?: number
}) {
  const [failed, setFailed] = useState(false)
  const kind = fileKind(item)
  if (thumb && item.hasPreview && !item.isDir && item.id && !failed)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="file-thumb" src={previewUrl(item.id, thumb)} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} />
    )
  return <TypeGlyph kind={kind} size={size} shared={Boolean(item.shareTypes?.length)} />
}
