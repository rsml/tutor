import { useCallback, useRef, useState } from 'react'

/**
 * Hook providing rAF-buffered streaming content state.
 * Accumulates text chunks in a ref and flushes to React state
 * at most once per animation frame for smooth 60fps rendering.
 */
export function useStreamingContent() {
  const [content, setContent] = useState('')
  const bufferRef = useRef('')
  const rafRef = useRef<number | null>(null)

  const flush = useCallback(() => {
    setContent(bufferRef.current)
    rafRef.current = null
  }, [])

  const appendChunk = useCallback((text: string) => {
    bufferRef.current += text
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(flush)
    }
  }, [flush])

  const reset = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    bufferRef.current = ''
    setContent('')
  }, [])

  /** Force-flush any pending buffer immediately (e.g., on stream end). */
  const flushNow = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setContent(bufferRef.current)
  }, [])

  return { content, appendChunk, reset, flushNow, bufferRef }
}
