import { useCallback, useEffect, useRef, useState } from 'react'

const RESISTANCE_FACTOR = 300
const THRESHOLD = 0.5
const DEBOUNCE_MS = 150
const COOLDOWN_MS = 300
const STIFFNESS = 12
const DAMPING = 0.72

interface UsePageTurnGestureOptions {
  scrollRef: React.RefObject<HTMLElement | null>
  hasPrev: boolean
  hasNext: boolean
  onNextChapter: () => void
  onPrevChapter: () => void
}

interface PageTurnState {
  progress: number
  direction: 'next' | 'prev' | null
  isAnimating: boolean
}

export function usePageTurnGesture({
  scrollRef,
  hasPrev,
  hasNext,
  onNextChapter,
  onPrevChapter,
}: UsePageTurnGestureOptions): PageTurnState {
  const [state, setState] = useState<PageTurnState>({
    progress: 0,
    direction: null,
    isAnimating: false,
  })

  const virtualOffset = useRef(0)
  const directionRef = useRef<'next' | 'prev' | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const animFrameRef = useRef<number>(undefined)
  const cooldownRef = useRef(false)

  const resetState = useCallback(() => {
    virtualOffset.current = 0
    directionRef.current = null
    setState({ progress: 0, direction: null, isAnimating: false })
  }, [])

  const animateSnap = useCallback((target: number, onComplete?: () => void) => {
    setState(prev => ({ ...prev, isAnimating: true }))
    let current = virtualOffset.current > 0
      ? 1 - 1 / (1 + virtualOffset.current / RESISTANCE_FACTOR)
      : 0

    const animate = () => {
      const diff = target - current
      current += diff * STIFFNESS * (1 / 60)
      current = current * DAMPING + target * (1 - DAMPING)

      if (Math.abs(target - current) < 0.005) {
        current = target
        setState(prev => ({
          ...prev,
          progress: target,
          isAnimating: false,
        }))
        onComplete?.()
        return
      }

      setState(prev => ({ ...prev, progress: current }))
      animFrameRef.current = requestAnimationFrame(animate)
    }

    animFrameRef.current = requestAnimationFrame(animate)
  }, [])

  const handleRelease = useCallback(() => {
    const progress = 1 - 1 / (1 + virtualOffset.current / RESISTANCE_FACTOR)
    const dir = directionRef.current

    if (progress >= THRESHOLD && dir) {
      animateSnap(1, () => {
        cooldownRef.current = true
        setTimeout(() => {
          cooldownRef.current = false
        }, COOLDOWN_MS)

        if (dir === 'next') onNextChapter()
        else onPrevChapter()

        // Reset after a frame so the navigation happens first
        requestAnimationFrame(resetState)
      })
    } else {
      animateSnap(0, resetState)
    }
  }, [animateSnap, onNextChapter, onPrevChapter, resetState])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (cooldownRef.current) return

      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      const atTop = el.scrollTop <= 0
      const goingDown = e.deltaY > 0
      const goingUp = e.deltaY < 0

      const shouldCapture =
        (atBottom && goingDown && hasNext) ||
        (atTop && goingUp && hasPrev)

      if (!shouldCapture) {
        // If we were accumulating, release
        if (directionRef.current) {
          handleRelease()
        }
        return
      }

      e.preventDefault()

      const newDir = goingDown ? 'next' : 'prev'
      if (directionRef.current && directionRef.current !== newDir) {
        resetState()
        return
      }

      directionRef.current = newDir
      virtualOffset.current += Math.abs(e.deltaY)

      const progress = 1 - 1 / (1 + virtualOffset.current / RESISTANCE_FACTOR)
      setState({ progress, direction: newDir, isAnimating: false })

      // Debounce release detection
      clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(handleRelease, DEBOUNCE_MS)
    }

    el.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      el.removeEventListener('wheel', handleWheel)
      clearTimeout(debounceTimer.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [scrollRef, hasPrev, hasNext, handleRelease, resetState])

  return state
}
