'use client'
import type { DeckLabel } from '@/lib/nextcloud/deck'
import { Icon } from '../Icon'
import { labelStyle } from './status'

/**
 * "Will get: [Design ×] [Urgent ×]" — the labels a new issue will be created
 * with. Buttons don't take focus, so the title box stays active.
 */
export function LabelChips({
  labels,
  onRemove,
  onAdd,
  available = [],
  prefix = 'Will get',
}: {
  labels: DeckLabel[]
  onRemove: (label: DeckLabel) => void
  /** With `available`, shows a "+ Label" picker. */
  onAdd?: (label: DeckLabel) => void
  available?: DeckLabel[]
  prefix?: string
}) {
  const rest = available.filter((l) => !labels.some((x) => x.id === l.id))
  if (!labels.length && !(onAdd && rest.length)) return null
  return (
    <div className="label-chips">
      {labels.length > 0 && <span className="label-chips-prefix">{prefix}:</span>}
      {labels.map((l) => (
        <span key={l.id} className="label-chip label-chip-sm label-chip-removable" style={labelStyle(l.color)}>
          {l.title}
          <button type="button" aria-label={`Don’t add ${l.title}`} title="Don’t add this label" onMouseDown={(e) => e.preventDefault()} onClick={() => onRemove(l)}>
            <Icon name="close" size={10} />
          </button>
        </span>
      ))}
      {onAdd && rest.length > 0 && (
        <select
          className="label-add"
          value=""
          aria-label="Add a label"
          onChange={(e) => {
            const l = rest.find((x) => x.id === Number(e.target.value))
            if (l) onAdd(l)
          }}
        >
          <option value="">+ Label</option>
          {rest.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
