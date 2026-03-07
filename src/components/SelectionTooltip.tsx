import { useRef, useState, useLayoutEffect } from 'react'
import { Lightbulb, MessageCircle, ArrowDown, SendHorizontal } from 'lucide-react'

interface SelectionTooltipProps {
  selectedText: string
  selectionRect: DOMRect | null
  onAction: (prompt: string) => void
}

const PAD = 8

export function SelectionTooltip({ selectedText, selectionRect, onAction }: SelectionTooltipProps) {
  const [customPrompt, setCustomPrompt] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  // Measure tooltip and clamp to viewport after render
  useLayoutEffect(() => {
    if (!selectionRect || !tooltipRef.current) {
      setPosition(null)
      return
    }

    const el = tooltipRef.current
    const tooltipWidth = el.offsetWidth
    const tooltipHeight = el.offsetHeight
    const centerX = selectionRect.left + selectionRect.width / 2

    // Clamp horizontal
    let finalLeft = centerX - tooltipWidth / 2
    finalLeft = Math.max(PAD, Math.min(finalLeft, window.innerWidth - tooltipWidth - PAD))

    // Prefer above selection, flip below if no room
    let finalTop = selectionRect.top - 8 - tooltipHeight
    if (finalTop < PAD) {
      finalTop = selectionRect.bottom + 8
    }

    setPosition({ top: finalTop, left: finalLeft })
  }, [selectionRect])

  // Reset position when selection changes so we re-measure
  const prevRect = useRef<DOMRect | null>(null)
  if (selectionRect !== prevRect.current) {
    prevRect.current = selectionRect
    if (position !== null) setPosition(null)
  }

  if (!selectedText || !selectionRect) return null

  const handleAction = (type: string) => {
    const prompts: Record<string, string> = {
      explain: 'Explain this simply and clearly.',
      discuss: 'Let\'s discuss this — what are the key implications and tradeoffs?',
      deeper: 'Go deeper on this topic. What are the nuances I should understand?',
    }
    onAction(prompts[type])
  }

  const handleCustomSubmit = () => {
    const trimmed = customPrompt.trim()
    if (trimmed) {
      onAction(trimmed)
      setCustomPrompt('')
    }
  }

  return (
    <div
      ref={tooltipRef}
      data-selection-tooltip
      className="fixed z-30"
      style={{
        top: position?.top ?? (selectionRect.top - 8),
        left: position?.left ?? (selectionRect.left + selectionRect.width / 2),
        visibility: position ? 'visible' : 'hidden',
      }}
      onMouseDown={(e) => {
        // Prevent browser from clearing text selection for ALL clicks inside tooltip
        e.preventDefault()
        e.stopPropagation()
        // Restore input focusability that preventDefault suppresses
        if (e.target instanceof HTMLInputElement) {
          e.target.focus()
        }
      }}
    >
      <div className="flex flex-col gap-1.5 rounded-xl border border-border-default/50 bg-surface-overlay/95 p-1.5 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => handleAction('explain')}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-content-secondary transition-colors hover:bg-surface-muted hover:text-content-primary"
          >
            <Lightbulb className="size-3.5" />
            Explain
          </button>
          <button
            onClick={() => handleAction('discuss')}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-content-secondary transition-colors hover:bg-surface-muted hover:text-content-primary"
          >
            <MessageCircle className="size-3.5" />
            Discuss
          </button>
          <button
            onClick={() => handleAction('deeper')}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-content-secondary transition-colors hover:bg-surface-muted hover:text-content-primary"
          >
            <ArrowDown className="size-3.5" />
            Go deeper
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border-default/50 bg-surface-raised px-2 py-1">
          <input
            ref={inputRef}
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCustomSubmit()}
            placeholder="Type a question..."
            className="flex-1 bg-transparent text-sm text-content-primary placeholder:text-content-muted/50 outline-none"
          />
          {customPrompt.trim() && (
            <button
              onClick={handleCustomSubmit}
              className="rounded-md p-0.5 text-content-muted transition-colors hover:text-content-primary"
            >
              <SendHorizontal className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
