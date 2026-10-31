'use client'

/** POSTs one file as multipart `file`, reporting progress (fetch can't report upload progress). */
export function uploadWithProgress<T>(url: string, file: File, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as T)
      else reject(new Error((xhr.response as { error?: string } | null)?.error ?? `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Upload failed: network error.'))
    const form = new FormData()
    form.set('file', file, file.name)
    xhr.send(form)
  })
}

export async function deleteRequest(url: string) {
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Delete failed (${res.status})`)
}

export const isImageName = (name: string) => /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name)

export function fmtSize(bytes?: number) {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
  const gb = bytes / 1024 ** 3
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
}
