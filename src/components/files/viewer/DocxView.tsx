'use client'
import { renderAsync } from 'docx-preview'
import { useEffect, useRef, useState } from 'react'

/**
 * Word (.docx) drawn as pages by docx-preview, inside a sandboxed frame with
 * scripts off: the document's links and styles can't touch the app.
 */
export default function DocxView({ data }: { data: ArrayBuffer }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [error, setError] = useState<unknown>(null)
  if (error) throw error

  useEffect(() => {
    const doc = frame.current?.contentDocument
    if (!doc) return
    doc.open()
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8"><base target="_blank">' +
        '<style>html,body{margin:0;background:#e8eaed}.docx-wrapper{background:#e8eaed!important;padding:24px 0!important}' +
        '.docx-wrapper>section.docx{box-shadow:0 1px 3px #0003;margin:0 auto 24px!important}' +
        '@media (max-width:860px){.docx-wrapper>section.docx{transform-origin:top left}}</style></head><body><div id="s"></div><div id="b"></div></body></html>',
    )
    doc.close()
    const body = doc.getElementById('b')!
    renderAsync(data, body, doc.getElementById('s')!, { inWrapper: true, ignoreLastRenderedPageBreak: true, experimental: true, useBase64URL: true })
      .then(() => {
        // Phones: scale pages down to the frame width.
        const page = doc.querySelector<HTMLElement>('section.docx')
        const fit = () => {
          if (!page) return
          const scale = Math.min(1, (doc.documentElement.clientWidth - 16) / page.offsetWidth)
          body.style.zoom = String(scale)
        }
        fit()
        frame.current?.contentWindow?.addEventListener('resize', fit)
      })
      .catch(setError)
  }, [data])

  return <iframe ref={frame} className="viewer-frame viewer-docx" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" title="Document" />
}
