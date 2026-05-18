import { useEffect, useRef, useState } from 'react'
import { Loader2, X, SendHorizontal } from 'lucide-react'

interface ReviseTocPanelProps {
  open: boolean
  onClose: () => void
  onSubmit: (feedback: string) => void
  submitting?: boolean
}

export function ReviseTocPanel({ open, onClose, onSubmit, submitting }: ReviseTocPanelProps) {
  const [feedback, setFeedback] = useState('')
  const [width, setWidth] = useState(420)
  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    if (open) {
      setFeedback('')
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [open])

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    const panel = panelRef.current
    if (!panel) return
    panel.style.transition = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return
      const newWidth = Math.min(720, Math.max(320, window.innerWidth - ev.clientX))
      panel.style.width = `${newWidth}px`
    }
    const onUp = () => {
      isDraggingRef.current = false
      const finalWidth = parseInt(panel.style.width, 10) || width
      panel.style.transition = ''
      setWidth(finalWidth)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleSubmit = () => {
    const trimmed = feedback.trim()
    if (!trimmed || submitting) return
    onSubmit(trimmed)
  }

  return (
    <div
      ref={panelRef}
      className={`relative flex shrink-0 flex-col border-l border-border-default/50 bg-surface-base/95 backdrop-blur-sm transition-[width] duration-300 overflow-hidden ${
        !open ? 'w-0 border-l-0' : ''
      }`}
      style={{ width: open ? width : 0 }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        className="absolute left-0 top-0 bottom-0 z-10 flex w-1.5 cursor-col-resize items-center justify-center hover:bg-border-default/30 transition-colors"
      >
        <div className="h-8 w-0.5 rounded-full bg-content-muted/30" />
      </div>

      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border-default/50 px-4">
        <span className="text-sm font-medium text-content-primary">Edit Table of Contents</span>
        <button
          onClick={onClose}
          disabled={submitting}
          className="rounded-md p-1 text-content-muted transition-colors hover:text-content-primary disabled:opacity-30"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <p className="text-xs text-content-muted leading-relaxed">
          What would you like to edit? For example: "make chapter 1 simpler", "change chapter 3 to be about X instead", "merge chapters 5 and 6". Untouched chapters will be preserved.
        </p>
        <textarea
          ref={textareaRef}
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Change chapter 1 to be simpler..."
          rows={8}
          disabled={submitting}
          className="flex-1 min-h-[10rem] resize-none rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 disabled:opacity-50"
        />
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-default/50 px-4 py-3">
        <button
          onClick={onClose}
          disabled={submitting}
          className="px-3 py-1.5 text-sm text-content-muted hover:text-content-secondary transition-colors disabled:opacity-30"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!feedback.trim() || submitting}
          className="inline-flex items-center gap-1.5 rounded-md bg-[oklch(0.55_0.20_285)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[oklch(0.50_0.22_285)] disabled:opacity-40"
        >
          {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <SendHorizontal className="size-3.5" />}
          Revise
        </button>
      </div>
    </div>
  )
}
