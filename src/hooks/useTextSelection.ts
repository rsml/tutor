import { useCallback, useEffect, useRef, useState } from 'react'

interface TextSelection {
  selectedText: string
  selectionRect: DOMRect | null
  clearSelection: () => void
}

export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>): TextSelection {
  const [selectedText, setSelectedText] = useState('')
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null)
  const lastScrollY = useRef(0)
  const selectedTextRef = useRef('')

  useEffect(() => { selectedTextRef.current = selectedText }, [selectedText])

  const clearSelection = useCallback(() => {
    setSelectedText('')
    setSelectionRect(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseUp = () => {
      // Small delay to let browser finalize selection
      requestAnimationFrame(() => {
        const sel = window.getSelection()
        const text = sel?.toString().trim()
        if (!text || !sel?.rangeCount) {
          return
        }

        // Check the selection is inside our container
        const range = sel.getRangeAt(0)
        if (!container.contains(range.commonAncestorContainer)) {
          return
        }

        const rect = range.getBoundingClientRect()
        setSelectedText(text)
        setSelectionRect(rect)
        lastScrollY.current = window.scrollY
      })
    }

    const handleClickOutside = (e: MouseEvent) => {
      // Don't clear if clicking inside the tooltip
      const target = e.target as HTMLElement
      if (target.closest('[data-selection-tooltip]')) return
      if (target.closest('[data-chat-panel]')) return

      // Only clear if we have an active selection (tooltip is showing).
      // Avoids killing drag-selections at mousedown before they start.
      if (selectedTextRef.current) {
        clearSelection()
      }
    }

    const handleScroll = () => {
      if (Math.abs(window.scrollY - lastScrollY.current) > 20) {
        clearSelection()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection()
    }

    const handleSelectionChange = () => {
      // Don't clear selection state while user interacts with tooltip/chat
      const active = document.activeElement
      if (active?.closest('[data-selection-tooltip]') || active?.closest('[data-chat-panel]')) return

      const sel = window.getSelection()
      if (!sel?.toString().trim() && selectedTextRef.current) {
        // Only clear React state — don't call removeAllRanges() which
        // would interfere with in-progress drag selections
        setSelectedText('')
        setSelectionRect(null)
      }
    }

    container.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('selectionchange', handleSelectionChange)
    window.addEventListener('scroll', handleScroll, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('selectionchange', handleSelectionChange)
      window.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [containerRef, clearSelection])

  return { selectedText, selectionRect, clearSelection }
}
