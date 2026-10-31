'use client'
import { useMemo, useState } from 'react'
import { read, utils, type WorkSheet } from 'xlsx'

const MAX_ROWS = 2000
const MAX_COLS = 100

type Grid = { rows: string[][]; spans: Map<string, { r: number; c: number }>; hidden: Set<string>; moreRows: number; moreCols: number }

function toGrid(ws: WorkSheet): Grid {
  const ref = ws['!ref']
  if (!ref) return { rows: [], spans: new Map(), hidden: new Set(), moreRows: 0, moreCols: 0 }
  const range = utils.decode_range(ref)
  const rowsTotal = range.e.r - range.s.r + 1
  const colsTotal = range.e.c - range.s.c + 1
  const lastRow = range.s.r + Math.min(rowsTotal, MAX_ROWS) - 1
  const lastCol = range.s.c + Math.min(colsTotal, MAX_COLS) - 1
  const rows: string[][] = []
  for (let r = range.s.r; r <= lastRow; r++) {
    const row: string[] = []
    for (let c = range.s.c; c <= lastCol; c++) {
      const cell = ws[utils.encode_cell({ r, c })]
      row.push(cell ? String(cell.w ?? cell.v ?? (cell.f ? '=' + cell.f : '')) : '')
    }
    rows.push(row)
  }
  // Merged cells: the top-left cell spans, the rest are skipped.
  const spans = new Map<string, { r: number; c: number }>()
  const hidden = new Set<string>()
  for (const m of ws['!merges'] ?? []) {
    if (m.s.r > lastRow || m.s.c > lastCol) continue
    const r0 = m.s.r - range.s.r
    const c0 = m.s.c - range.s.c
    spans.set(`${r0}:${c0}`, { r: Math.min(m.e.r, lastRow) - m.s.r + 1, c: Math.min(m.e.c, lastCol) - m.s.c + 1 })
    for (let r = m.s.r; r <= Math.min(m.e.r, lastRow); r++)
      for (let c = m.s.c; c <= Math.min(m.e.c, lastCol); c++) if (r !== m.s.r || c !== m.s.c) hidden.add(`${r - range.s.r}:${c - range.s.c}`)
  }
  return { rows, spans, hidden, moreRows: rowsTotal - rows.length, moreCols: colsTotal - (lastCol - range.s.c + 1) }
}

/** Spreadsheets (xlsx, xls, ods, csv) as a read-only grid with a tab per sheet. */
export default function SheetView({ data, name }: { data: ArrayBuffer; name: string }) {
  const book = useMemo(() => read(data, { type: 'array', cellDates: true, dense: false, ...(/\.(csv|tsv)$/i.test(name) ? { codepage: 65001 } : {}) }), [data, name])
  const [sheet, setSheet] = useState(book.SheetNames[0])
  const grid = useMemo(() => toGrid(book.Sheets[sheet]), [book, sheet])
  const startRow = book.Sheets[sheet]['!ref'] ? utils.decode_range(book.Sheets[sheet]['!ref']!).s.r : 0
  const startCol = book.Sheets[sheet]['!ref'] ? utils.decode_range(book.Sheets[sheet]['!ref']!).s.c : 0

  return (
    <div className="viewer-sheet">
      <div className="sheet-scroll">
        {grid.rows.length === 0 ? (
          <p className="muted sheet-empty">This sheet is empty.</p>
        ) : (
          <table className="sheet-table">
            <thead>
              <tr>
                <th className="sheet-corner" />
                {grid.rows[0].map((_, c) => (
                  <th key={c}>{utils.encode_col(startCol + c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row, r) => (
                <tr key={r}>
                  <th>{startRow + r + 1}</th>
                  {row.map((v, c) => {
                    if (grid.hidden.has(`${r}:${c}`)) return null
                    const span = grid.spans.get(`${r}:${c}`)
                    return (
                      <td key={c} rowSpan={span?.r} colSpan={span?.c} className={/^-?[\d.,$€£%() ]+$/.test(v) && v.trim() ? 'sheet-num' : undefined}>
                        {v}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(grid.moreRows > 0 || grid.moreCols > 0) && (
          <p className="muted small sheet-more">
            Showing the first {MAX_ROWS.toLocaleString()} rows and {MAX_COLS} columns. Download the file to see everything.
          </p>
        )}
      </div>
      {book.SheetNames.length > 1 && (
        <nav className="sheet-tabs" aria-label="Sheets">
          {book.SheetNames.map((n) => (
            <button key={n} className={`sheet-tab${n === sheet ? ' is-active' : ''}`} onClick={() => setSheet(n)}>
              {n}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
