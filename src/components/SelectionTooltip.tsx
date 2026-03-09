import { useRef, useState } from 'react'
import { Lightbulb, MessageCircle, ArrowDown, SendHorizontal } from 'lucide-react'

interface SelectionTooltipProps {
  selectedText: string
  selectionRect: DOMRect | null
  onAction: (prompt: string) => void
}

export function SelectionTooltip({ selectedText, selectionRect, onAction }: SelectionTooltipProps) {
  const [customPrompt, setCustomPrompt] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  if (!selectedText || !selectionRect) return null

  // Position the tooltip above the selection
  const top = selectionRect.top - 8
  const left = selectionRect.left + selectionRect.width / 2

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
      data-selection-tooltip
      className="fixed z-30 -translate-x-1/2 -translate-y-full"
      style={{ top, left }}
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
