'use client'

/** What the Android share sheet sent (kept in the browser by the service worker, see public/sw.js). */
export type SharedItems = { title: string; text: string; url: string; files: File[]; at: number }

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('avronext-share', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('share')
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
}

export async function readShared(): Promise<SharedItems | null> {
  try {
    const d = await db()
    return await new Promise((resolve) => {
      const req = d.transaction('share').objectStore('share').get('pending')
      req.onsuccess = () => resolve((req.result as SharedItems | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function clearShared() {
  try {
    const d = await db()
    await new Promise<void>((resolve) => {
      const tx = d.transaction('share', 'readwrite')
      tx.objectStore('share').delete('pending')
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    /* nothing to clear */
  }
}
