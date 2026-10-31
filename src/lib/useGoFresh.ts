'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect } from 'react'
import { startNavProgress } from '@/components/NavProgress'

let refreshOnArrival = false

/**
 * After a write that lands on another screen: navigate there, and once it has
 * arrived re-fetch, so layouts the URL change doesn't touch (sidebar page
 * tree, top-nav lists) are current too.
 *
 * The refresh waits for the navigation: started straight after router.push()
 * (or done via revalidatePath()/redirect() in the action) it races the
 * navigation's response, and the router can drop one of them.
 */
export function useGoFresh() {
  const router = useRouter()
  return useCallback(
    (href: string) => {
      refreshOnArrival = true
      startNavProgress()
      router.push(href)
    },
    [router],
  )
}

/** Mounted once in the app layout: performs the refresh useGoFresh() asked for. */
export function RefreshOnArrival() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const location = `${pathname}?${params.toString()}`
  useEffect(() => {
    if (!refreshOnArrival) return
    refreshOnArrival = false
    router.refresh()
  }, [location, router])
  return null
}
