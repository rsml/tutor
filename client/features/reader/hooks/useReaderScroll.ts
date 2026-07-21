import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import { AT_BOTTOM_EPSILON_PX, SMOOTH_SCROLL_MS } from '@client/lib/constants'
import type { Phase } from '@client/features/reader/ReaderPage'

export interface UseReaderScrollOptions {
  phase: Phase
  streamingContent: string
  scrollRef: RefObject<HTMLElement | null>
  userHasScrolledRef: MutableRefObject<boolean>
}

export interface UseReaderScrollReturn {
  smoothScrollBy: (deltaY: number, duration?: number) => void
}

/**
 * Owns the reader's scroll behaviour during chapter generation: a custom
 * RAF-based smooth scroll used by keyboard navigation, an autoscroll effect
 * that follows streamed content down the page, and the scroll-position
 * tracking that turns autoscroll off the moment the reader scrolls up
 * themselves.
 *
 * Non-obvious constraint: `userHasScrolledRef` is the same switch
 * useGenerationResume sets the instant it renders buffered content from a
 * reconnect (see that hook's doc comment) — reader-initiated scrolling and a
 * mid-stream reconnect both need to suppress autoscroll for the rest of that
 * generation, which is why the ref is passed in rather than owned here.
 * `AT_BOTTOM_EPSILON_PX` re-enables autoscroll once the reader scrolls back
 * down near the bottom, since sub-pixel layout rounding means "at the
 * bottom" is rarely an exact match.
 */
export function useReaderScroll({
  phase,
  streamingContent,
  scrollRef,
  userHasScrolledRef,
}: UseReaderScrollOptions): UseReaderScrollReturn {
  const smoothScrollRafRef = useRef<number | null>(null)
  const smoothScrollTargetRef = useRef<number | null>(null)

  // Custom RAF-based smooth scroll — smoother than native `behavior: smooth`
  // and cumulative (rapid presses stack their deltas instead of restarting).
  const smoothScrollBy = useCallback((deltaY: number, duration = SMOOTH_SCROLL_MS) => {
    const el = scrollRef.current
    if (!el) return
    const baseY = smoothScrollTargetRef.current ?? el.scrollTop
    const targetY = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, baseY + deltaY))
    smoothScrollTargetRef.current = targetY
    if (smoothScrollRafRef.current) cancelAnimationFrame(smoothScrollRafRef.current)
    const startY = el.scrollTop
    const startTime = performance.now()
    const totalDelta = targetY - startY
    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      // easeOutCubic — fast start, gentle landing
      const eased = 1 - Math.pow(1 - t, 3)
      el.scrollTop = startY + totalDelta * eased
      if (t < 1) {
        smoothScrollRafRef.current = requestAnimationFrame(step)
      } else {
        smoothScrollRafRef.current = null
        smoothScrollTargetRef.current = null
      }
    }
    smoothScrollRafRef.current = requestAnimationFrame(step)
  }, [scrollRef])

  // Auto-scroll during streaming, but stop if user scrolls manually
  useEffect(() => {
    if (phase !== 'generating' || !streamingContent) return
    if (userHasScrolledRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [phase, streamingContent, scrollRef, userHasScrolledRef])

  // Detect user scroll during streaming to disable auto-scroll
  useEffect(() => {
    if (phase !== 'generating') {
      userHasScrolledRef.current = false
      return
    }
    const el = scrollRef.current
    if (!el) return
    let lastScrollTop = el.scrollTop
    let ticking = false
    const handleScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - AT_BOTTOM_EPSILON_PX
        if (el.scrollTop < lastScrollTop && !atBottom) {
          userHasScrolledRef.current = true
        }
        if (atBottom) {
          userHasScrolledRef.current = false
        }
        lastScrollTop = el.scrollTop
      })
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [phase, scrollRef, userHasScrolledRef])

  return { smoothScrollBy }
}
