'use client'
import JSZip from 'jszip'
import { useEffect, useState, type CSSProperties } from 'react'

/**
 * A small, read-only PowerPoint (.pptx) renderer: positioned text boxes,
 * pictures, filled shapes and tables, with layout/master placeholder positions
 * and theme colours. Animations, charts and SmartArt are not drawn.
 * Everything is rendered as React elements (no HTML from the file).
 */

const EMU_PER_PT = 12700
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

type Box = { x: number; y: number; w: number; h: number }
type Run = { text: string; style: CSSProperties; br?: boolean }
type Para = { runs: Run[]; align: CSSProperties['textAlign']; bullet: string | null; level: number }
type Shape =
  | { kind: 'text'; box: Box; fill: string | null; line: string | null; round: boolean; ellipse: boolean; anchor: 'flex-start' | 'center' | 'flex-end'; paras: Para[]; rot: number }
  | { kind: 'image'; box: Box; src: string; rot: number }
  | { kind: 'table'; box: Box; rows: { cells: { paras: Para[]; fill: string | null; span: number }[]; h: number }[]; cols: number[] }
type Slide = { width: number; height: number; bg: string | null; shapes: Shape[] }

const kids = (el: Element | null | undefined, ns: string, name: string) =>
  el ? Array.from(el.children).filter((c) => c.namespaceURI === ns && c.localName === name) : []
const kid = (el: Element | null | undefined, ns: string, name: string) => kids(el, ns, name)[0] ?? null
const desc = (el: Element | null | undefined, ns: string, name: string) => (el ? (el.getElementsByTagNameNS(ns, name)[0] ?? null) : null)
const num = (v: string | null | undefined, d = 0) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v))

function resolvePath(base: string, target: string) {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}
const relsPath = (part: string) => {
  const i = part.lastIndexOf('/')
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`
}

class Deck {
  private xmlCache = new Map<string, Document | null>()
  private relCache = new Map<string, Map<string, { target: string; type: string }>>()
  private media = new Map<string, string>()
  urls: string[] = []
  theme = new Map<string, string>()
  constructor(private zip: JSZip) {}

  async xml(path: string) {
    if (!this.xmlCache.has(path)) {
      const text = await this.zip.file(path)?.async('text')
      this.xmlCache.set(path, text ? new DOMParser().parseFromString(text, 'application/xml') : null)
    }
    return this.xmlCache.get(path)!
  }
  async rels(part: string) {
    if (!this.relCache.has(part)) {
      const doc = await this.xml(relsPath(part))
      const map = new Map<string, { target: string; type: string }>()
      for (const r of Array.from(doc?.getElementsByTagName('Relationship') ?? []))
        if (r.getAttribute('TargetMode') !== 'External') map.set(r.getAttribute('Id')!, { target: resolvePath(part, r.getAttribute('Target')!), type: r.getAttribute('Type') ?? '' })
      this.relCache.set(part, map)
    }
    return this.relCache.get(part)!
  }
  async related(part: string, type: string) {
    for (const r of (await this.rels(part)).values()) if (r.type.endsWith('/' + type)) return r.target
    return null
  }
  async image(part: string, rid: string) {
    const target = (await this.rels(part)).get(rid)?.target
    if (!target || !/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(target)) return null
    if (!this.media.has(target)) {
      const blob = await this.zip.file(target)?.async('blob')
      if (!blob) return null
      const typed = target.toLowerCase().endsWith('.svg') ? new Blob([blob], { type: 'image/svg+xml' }) : blob
      const url = URL.createObjectURL(typed)
      this.urls.push(url)
      this.media.set(target, url)
    }
    return this.media.get(target)!
  }

  color(el: Element | null): string | null {
    if (!el) return null
    const srgb = kid(el, A, 'srgbClr')
    const scheme = kid(el, A, 'schemeClr')
    const sys = kid(el, A, 'sysClr')
    let hex: string | null = null
    let mod: Element | null = null
    if (srgb) [hex, mod] = [srgb.getAttribute('val'), srgb]
    else if (sys) [hex, mod] = [sys.getAttribute('lastClr'), sys]
    else if (scheme) {
      const alias: Record<string, string> = { tx1: 'dk1', tx2: 'dk2', bg1: 'lt1', bg2: 'lt2' }
      const key = scheme.getAttribute('val') ?? ''
      ;[hex, mod] = [this.theme.get(alias[key] ?? key) ?? null, scheme]
    }
    if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return null
    let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex!.slice(i, i + 2), 16))
    const lumMod = kid(mod, A, 'lumMod')?.getAttribute('val')
    const lumOff = kid(mod, A, 'lumOff')?.getAttribute('val')
    const tint = kid(mod, A, 'tint')?.getAttribute('val')
    const shade = kid(mod, A, 'shade')?.getAttribute('val')
    if (lumMod || lumOff) [r, g, b] = [r, g, b].map((c) => Math.round(Math.min(255, c * (num(lumMod, 100000) / 100000) + 255 * (num(lumOff) / 100000))))
    if (tint) [r, g, b] = [r, g, b].map((c) => Math.round(c + (255 - c) * (1 - num(tint) / 100000)))
    if (shade) [r, g, b] = [r, g, b].map((c) => Math.round(c * (num(shade) / 100000)))
    const alpha = kid(mod, A, 'alpha')?.getAttribute('val')
    return alpha ? `rgba(${r},${g},${b},${num(alpha) / 100000})` : `rgb(${r},${g},${b})`
  }
}

function xfrmOf(el: Element | null): Box | null {
  const xf = el && (desc(el, A, 'xfrm') ?? desc(el, P, 'xfrm'))
  const off = kid(xf, A, 'off')
  const ext = kid(xf, A, 'ext')
  if (!off || !ext) return null
  return { x: num(off.getAttribute('x')), y: num(off.getAttribute('y')), w: num(ext.getAttribute('cx')), h: num(ext.getAttribute('cy')) }
}

/** Placeholder key on a shape: its type and index (layouts/masters match on either). */
function phOf(sp: Element) {
  const ph = desc(sp, P, 'ph')
  if (!ph) return null
  return { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') }
}

async function placeholderBox(deck: Deck, parts: string[], ph: { type: string; idx: string | null }) {
  for (const part of parts) {
    const doc = await deck.xml(part)
    for (const sp of Array.from(doc?.getElementsByTagNameNS(P, 'sp') ?? [])) {
      const other = phOf(sp)
      if (!other) continue
      const sameType = other.type === ph.type || (['title', 'ctrTitle'].includes(other.type) && ['title', 'ctrTitle'].includes(ph.type))
      if ((ph.idx && other.idx === ph.idx) || sameType) {
        const box = xfrmOf(kid(sp, P, 'spPr'))
        if (box) return box
      }
    }
  }
  return null
}

/** Shape defaults: autoshapes centre their text in the theme's font colour (p:style). */
type TextDefaults = { color: string | null; align: CSSProperties['textAlign'] | null }

function paragraphs(deck: Deck, txBody: Element | null, ph: { type: string } | null, defaults: TextDefaults = { color: null, align: null }): Para[] {
  const defaultPt = ph && ['title', 'ctrTitle'].includes(ph.type) ? 40 : ph?.type === 'subTitle' ? 24 : ph ? 20 : 18
  // Body placeholders get the master's bullets unless a paragraph turns them off.
  const bodyBullets = ph !== null && ['body', 'obj'].includes(ph.type)
  return kids(txBody, A, 'p').map((p) => {
    const pPr = kid(p, A, 'pPr')
    const algn = pPr?.getAttribute('algn')
    const level = num(pPr?.getAttribute('lvl'))
    const hasText = kids(p, A, 'r').some((r) => kid(r, A, 't')?.textContent)
    const buChar = kid(pPr, A, 'buNone') ? null : (kid(pPr, A, 'buChar')?.getAttribute('char') ?? (bodyBullets && hasText ? '•' : null))
    const runs: Run[] = []
    for (const r of Array.from(p.children)) {
      if (r.namespaceURI !== A) continue
      if (r.localName === 'br') runs.push({ text: '', style: {}, br: true })
      if (r.localName !== 'r' && r.localName !== 'fld') continue
      const rPr = kid(r, A, 'rPr')
      const sz = num(rPr?.getAttribute('sz')) / 100 || num(kid(p, A, 'endParaRPr')?.getAttribute('sz')) / 100 || defaultPt
      const color = deck.color(kid(rPr, A, 'solidFill'))
      runs.push({
        text: kid(r, A, 't')?.textContent ?? '',
        style: {
          fontSize: `calc(${sz} * var(--pt))`,
          fontWeight: rPr?.getAttribute('b') === '1' || (ph && ['title', 'ctrTitle'].includes(ph.type) && rPr?.getAttribute('b') !== '0') ? 700 : undefined,
          fontStyle: rPr?.getAttribute('i') === '1' ? 'italic' : undefined,
          textDecoration: rPr?.getAttribute('u') && rPr.getAttribute('u') !== 'none' ? 'underline' : undefined,
          color: color ?? defaults.color ?? undefined,
        },
      })
    }
    const sz = num(kid(p, A, 'endParaRPr')?.getAttribute('sz')) / 100 || defaultPt
    if (!runs.length) runs.push({ text: ' ', style: { fontSize: `calc(${sz} * var(--pt))` } })
    const align =
      algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : ph && ['ctrTitle', 'subTitle'].includes(ph.type) ? 'center' : (defaults.align ?? 'left')
    return { runs, align, bullet: buChar, level }
  })
}

async function shapesOf(deck: Deck, part: string, tree: Element, parts: string[], offset = { dx: 0, dy: 0, sx: 1, sy: 1 }): Promise<Shape[]> {
  const out: Shape[] = []
  const place = (b: Box): Box => ({ x: (b.x - offset.dx) * offset.sx, y: (b.y - offset.dy) * offset.sy, w: b.w * offset.sx, h: b.h * offset.sy })
  for (const el of Array.from(tree.children)) {
    if (el.namespaceURI !== P) continue
    if (el.localName === 'sp') {
      const spPr = kid(el, P, 'spPr')
      const ph = phOf(el)
      const box = xfrmOf(spPr) ?? (ph ? await placeholderBox(deck, parts, ph) : null)
      if (!box) continue
      const geom = kid(spPr, A, 'prstGeom')?.getAttribute('prst') ?? 'rect'
      const ln = kid(spPr, A, 'ln')
      const anchor = desc(el, A, 'bodyPr')?.getAttribute('anchor')
      const rot = num(kid(spPr, A, 'xfrm')?.getAttribute('rot')) / 60000
      const style = kid(el, P, 'style')
      const defaults: TextDefaults = style && !ph ? { color: deck.color(kid(style, A, 'fontRef')), align: 'center' } : { color: null, align: null }
      const styleFill = style && !kid(spPr, A, 'noFill') ? deck.color(kid(style, A, 'fillRef')) : null
      out.push({
        kind: 'text',
        box: place(box),
        fill: deck.color(kid(spPr, A, 'solidFill')) ?? styleFill,
        line: ln && !kid(ln, A, 'noFill') ? deck.color(kid(ln, A, 'solidFill')) : null,
        round: geom === 'roundRect',
        ellipse: geom === 'ellipse',
        anchor: anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : !anchor && ((ph && ['ctrTitle', 'title'].includes(ph.type)) || (style && !ph)) ? 'center' : 'flex-start',
        paras: paragraphs(deck, kid(el, P, 'txBody'), ph, defaults),
        rot,
      })
    } else if (el.localName === 'pic') {
      const box = xfrmOf(kid(el, P, 'spPr')) ?? (phOf(el) ? await placeholderBox(deck, parts, phOf(el)!) : null)
      const rid = desc(el, A, 'blip')?.getAttributeNS(R, 'embed')
      const src = rid ? await deck.image(part, rid) : null
      if (box && src) out.push({ kind: 'image', box: place(box), src, rot: num(desc(el, A, 'xfrm')?.getAttribute('rot')) / 60000 })
    } else if (el.localName === 'grpSp') {
      const xf = desc(kid(el, P, 'grpSpPr'), A, 'xfrm')
      const off = kid(xf, A, 'off')
      const ext = kid(xf, A, 'ext')
      const chOff = kid(xf, A, 'chOff')
      const chExt = kid(xf, A, 'chExt')
      if (!off || !ext || !chOff || !chExt) continue
      const sx = num(ext.getAttribute('cx')) / (num(chExt.getAttribute('cx')) || 1)
      const sy = num(ext.getAttribute('cy')) / (num(chExt.getAttribute('cy')) || 1)
      const inner = await shapesOf(deck, part, el, parts, { dx: num(chOff.getAttribute('x')), dy: num(chOff.getAttribute('y')), sx, sy })
      const gx = num(off.getAttribute('x'))
      const gy = num(off.getAttribute('y'))
      for (const s of inner) out.push({ ...s, box: place({ x: s.box.x + gx, y: s.box.y + gy, w: s.box.w, h: s.box.h }) } as Shape)
    } else if (el.localName === 'graphicFrame') {
      const tbl = desc(el, A, 'tbl')
      const box = xfrmOf(el)
      if (!tbl || !box) continue
      const cols = kids(kid(tbl, A, 'tblGrid'), A, 'gridCol').map((c) => num(c.getAttribute('w')))
      const rows = kids(tbl, A, 'tr').map((tr) => ({
        h: num(tr.getAttribute('h')),
        cells: kids(tr, A, 'tc')
          .filter((tc) => tc.getAttribute('hMerge') !== '1' && tc.getAttribute('vMerge') !== '1')
          .map((tc) => ({ paras: paragraphs(deck, kid(tc, A, 'txBody'), null), fill: deck.color(kid(kid(tc, A, 'tcPr'), A, 'solidFill')), span: num(tc.getAttribute('gridSpan'), 1) })),
      }))
      out.push({ kind: 'table', box: place(box), rows, cols })
    }
  }
  return out
}

async function background(deck: Deck, parts: string[]) {
  for (const part of parts) {
    const doc = await deck.xml(part)
    const bg = doc?.getElementsByTagNameNS(P, 'bg')[0]
    const fill = deck.color(desc(bg, A, 'solidFill'))
    if (fill) return fill
  }
  return null
}

async function loadDeck(data: ArrayBuffer): Promise<{ slides: Slide[]; urls: string[] }> {
  const zip = await JSZip.loadAsync(data)
  const deck = new Deck(zip)
  const pres = await deck.xml('ppt/presentation.xml')
  if (!pres) throw new Error('Not a PowerPoint file')
  const size = pres.getElementsByTagNameNS(P, 'sldSz')[0]
  const width = num(size?.getAttribute('cx'), 9144000)
  const height = num(size?.getAttribute('cy'), 5143500)

  const themePart = await deck.related('ppt/presentation.xml', 'theme')
  const scheme = themePart ? (await deck.xml(themePart))?.getElementsByTagNameNS(A, 'clrScheme')[0] : null
  for (const c of Array.from(scheme?.children ?? [])) {
    const hex = kid(c, A, 'srgbClr')?.getAttribute('val') ?? kid(c, A, 'sysClr')?.getAttribute('lastClr')
    if (hex) deck.theme.set(c.localName, hex)
  }

  const presRels = await deck.rels('ppt/presentation.xml')
  const ids = Array.from(pres.getElementsByTagNameNS(P, 'sldId')).map((s) => s.getAttributeNS(R, 'id') ?? '')
  const slides: Slide[] = []
  for (const id of ids) {
    const part = presRels.get(id)?.target
    const doc = part ? await deck.xml(part) : null
    if (!part || !doc) continue
    if (doc.documentElement.getAttribute('show') === '0') continue
    const layout = await deck.related(part, 'slideLayout')
    const master = layout ? await deck.related(layout, 'slideMaster') : null
    const chain = [layout, master].filter(Boolean) as string[]
    const tree = doc.getElementsByTagNameNS(P, 'spTree')[0]
    slides.push({ width, height, bg: await background(deck, [part, ...chain]), shapes: tree ? await shapesOf(deck, part, tree, chain) : [] })
  }
  return { slides, urls: deck.urls }
}

function Paras({ paras }: { paras: Para[] }) {
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} className="slide-p" style={{ textAlign: p.align, fontSize: p.runs[0]?.style.fontSize, paddingLeft: p.bullet ? `${1.1 + p.level * 1.2}em` : p.level ? `${p.level * 1.2}em` : undefined }}>
          {p.bullet && (
            <span className="slide-bullet" style={{ color: p.runs[0]?.style.color }}>
              {p.bullet}
            </span>
          )}
          {p.runs.map((r, j) => (r.br ? <br key={j} /> : <span key={j} style={r.style}>{r.text}</span>))}
        </p>
      ))}
    </>
  )
}

function SlideBox({ slide, n }: { slide: Slide; n: number }) {
  const pct = (b: Box): CSSProperties => ({
    left: `${(b.x / slide.width) * 100}%`,
    top: `${(b.y / slide.height) * 100}%`,
    width: `${(b.w / slide.width) * 100}%`,
    height: `${(b.h / slide.height) * 100}%`,
  })
  return (
    <figure className="slide" aria-label={`Slide ${n}`}>
      <div
        className="slide-canvas"
        style={{ aspectRatio: `${slide.width} / ${slide.height}`, background: slide.bg ?? '#fff', ['--pt' as string]: `${(100 / (slide.width / EMU_PER_PT)).toFixed(5)}cqw` }}
      >
        {slide.shapes.map((s, i) =>
          s.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} className="slide-shape" src={s.src} alt="" style={{ ...pct(s.box), transform: s.rot ? `rotate(${s.rot}deg)` : undefined }} />
          ) : s.kind === 'table' ? (
            <table key={i} className="slide-shape slide-table" style={pct(s.box)}>
              <colgroup>
                {s.cols.map((w, c) => (
                  <col key={c} style={{ width: `${(w / s.cols.reduce((a, b) => a + b, 0)) * 100}%` }} />
                ))}
              </colgroup>
              <tbody>
                {s.rows.map((row, r) => (
                  <tr key={r}>
                    {row.cells.map((cell, c) => (
                      <td key={c} colSpan={cell.span > 1 ? cell.span : undefined} style={{ background: cell.fill ?? undefined }}>
                        <Paras paras={cell.paras} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div
              key={i}
              className="slide-shape slide-text"
              style={{
                ...pct(s.box),
                background: s.fill ?? undefined,
                border: s.line ? `1px solid ${s.line}` : undefined,
                borderRadius: s.ellipse ? '50%' : s.round ? '8%' : undefined,
                justifyContent: s.anchor,
                transform: s.rot ? `rotate(${s.rot}deg)` : undefined,
              }}
            >
              <Paras paras={s.paras} />
            </div>
          ),
        )}
      </div>
      <figcaption className="slide-num">{n}</figcaption>
    </figure>
  )
}

export default function SlidesView({ data }: { data: ArrayBuffer }) {
  const [slides, setSlides] = useState<Slide[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  if (error) throw error
  useEffect(() => {
    let urls: string[] = []
    let live = true
    loadDeck(data)
      .then((d) => {
        urls = d.urls
        if (live) setSlides(d.slides)
        else urls.forEach((u) => URL.revokeObjectURL(u))
      })
      .catch((e) => live && setError(e))
    return () => {
      live = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [data])
  if (!slides) return <div className="viewer-message">Opening…</div>
  if (!slides.length) return <div className="viewer-message">This presentation has no slides.</div>
  return (
    <div className="viewer-slides">
      {slides.map((s, i) => (
        <SlideBox key={i} slide={s} n={i + 1} />
      ))}
    </div>
  )
}
