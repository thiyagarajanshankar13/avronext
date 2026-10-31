'use client'
import { useEffect, useRef, useState, type RefObject } from 'react'

/** Files dragged from the desktop onto `ref`'s element; `dragging` drives a "Drop to attach" overlay. */
export function useFileDrop(ref: RefObject<HTMLElement | null>, onFiles: (files: File[]) => void, enabled = true) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const handler = useRef(onFiles)
  handler.current = onFiles

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length) handler.current(files)
    }
    el.addEventListener('dragenter', enter)
    el.addEventListener('dragover', over)
    el.addEventListener('dragleave', leave)
    el.addEventListener('drop', drop)
    return () => {
      el.removeEventListener('dragenter', enter)
      el.removeEventListener('dragover', over)
      el.removeEventListener('dragleave', leave)
      el.removeEventListener('drop', drop)
    }
  }, [ref, enabled])

  return dragging
}
