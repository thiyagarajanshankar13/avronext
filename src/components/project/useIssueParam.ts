'use client'
import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

/**
 * The open issue lives in `?issue=<cardId>` so it can be linked and survives
 * reloads. Opening/closing only touches browser history (Next keeps
 * useSearchParams in sync), so it never re-fetches the board from Nextcloud.
 */
export function useIssueParam() {
  const pathname = usePathname()
  const params = useSearchParams()
  const issue = Number(params.get('issue')) || null
  const setIssue = useCallback(
    (id: number | null) => {
      const next = new URLSearchParams(window.location.search)
      if (id) next.set('issue', String(id))
      else next.delete('issue')
      const qs = next.toString()
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname],
  )
  return [issue, setIssue] as const
}
