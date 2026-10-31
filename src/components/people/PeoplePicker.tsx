'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { searchPeople } from '@/app/(app)/people-actions'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'

export type PersonKind = 'user' | 'group' | 'team'
export type PickedPerson = { kind: PersonKind; id: string; label: string; sub?: string }
export type RoleOption<R extends string | number> = { value: R; label: string; hint?: string }

export function PersonIcon({ kind, id, label, size = 32 }: { kind: PersonKind; id: string; label: string; size?: number }) {
  if (kind === 'user') return <Avatar uid={id} name={label} size={size} />
  return (
    <span className={`person-icon person-icon-${kind}`} style={{ width: size, height: size }} title={kind === 'group' ? 'Group' : 'Team'}>
      <Icon name={kind === 'group' ? 'group' : 'shield'} size={Math.round(size * 0.55)} />
    </span>
  )
}

/**
 * Search users / groups / teams (Nextcloud's sharing search), pick several,
 * choose a role and add them in one go.
 */
export function PeoplePicker<R extends string | number>({
  kinds,
  roles,
  defaultRole,
  exclude,
  onAdd,
  addLabel = 'Add',
}: {
  kinds: PersonKind[]
  roles: RoleOption<R>[]
  defaultRole: R
  /** "kind:id" keys already present. */
  exclude: Set<string>
  onAdd: (people: PickedPerson[], role: R) => Promise<string | null>
  addLabel?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickedPerson[]>([])
  const [picked, setPicked] = useState<PickedPerson[]>([])
  const [role, setRole] = useState<R>(defaultRole)
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const box = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (!q) return setResults([])
    const mine = ++seq.current
    const t = setTimeout(async () => {
      const r = await searchPeople(q, kinds)
      if (mine !== seq.current) return
      if (!r.ok) return setError(r.error)
      setResults(r.data.filter((p) => !exclude.has(`${p.kind}:${p.id}`) && !picked.some((x) => x.kind === p.kind && x.id === p.id)))
      setActive(0)
    }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const pick = (p: PickedPerson) => {
    setPicked((all) => [...all, p])
    setQuery('')
    setResults([])
  }

  const submit = () =>
    start(async () => {
      setError(null)
      const err = await onAdd(picked, role)
      if (err) setError(err)
      else setPicked([])
    })

  const kindsLabel = kinds.map((k) => (k === 'user' ? 'people' : k === 'group' ? 'groups' : 'teams')).join(', ').replace(/, ([^,]*)$/, ' or $1')

  return (
    <div className="people-picker" ref={box}>
      <div className="people-picker-row">
        <div className="people-input" onClick={() => box.current?.querySelector('input')?.focus()}>
          {picked.map((p) => (
            <span key={`${p.kind}:${p.id}`} className="people-chip">
              <PersonIcon kind={p.kind} id={p.id} label={p.label} size={20} />
              {p.label}
              <button type="button" aria-label={`Remove ${p.label}`} onClick={() => setPicked((all) => all.filter((x) => x !== p))}>
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
          <input
            value={query}
            placeholder={picked.length ? '' : `Search ${kindsLabel}…`}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setActive((i) => Math.min(i + 1, results.length - 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => Math.max(i - 1, 0)))
              else if (e.key === 'Enter' && results[active]) (e.preventDefault(), pick(results[active]))
              else if (e.key === 'Backspace' && !query && picked.length) setPicked((all) => all.slice(0, -1))
              else if (e.key === 'Escape') setOpen(false)
            }}
            aria-label={`Search ${kindsLabel}`}
            role="combobox"
            aria-expanded={open && results.length > 0}
          />
        </div>
        <select value={String(role)} onChange={(e) => setRole(roles.find((r) => String(r.value) === e.target.value)!.value)} aria-label="Role">
          {roles.map((r) => (
            <option key={String(r.value)} value={String(r.value)}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" disabled={!picked.length || pending} onClick={submit}>
          {pending ? 'Adding…' : addLabel}
        </button>
      </div>
      {open && results.length > 0 && (
        <ul className="people-results" role="listbox">
          {results.map((p, i) => (
            <li key={`${p.kind}:${p.id}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={`people-result${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(p)
                }}
              >
                <PersonIcon kind={p.kind} id={p.id} label={p.label} />
                <span>
                  <strong>{p.label}</strong>
                  <small>{p.kind === 'user' ? p.sub : p.kind === 'group' ? 'Group' : 'Team'}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && results.length === 0 && <div className="people-results people-empty muted small">No matches</div>}
      {roles.find((r) => r.value === role)?.hint && <p className="hint">{roles.find((r) => r.value === role)!.hint}</p>}
      {error && <div className="banner banner-error">{error}</div>}
    </div>
  )
}
