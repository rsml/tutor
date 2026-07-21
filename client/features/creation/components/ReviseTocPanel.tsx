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
          aria-label="Close"
          className="rounded-md p-1 text-content-muted transition-colors hover:text-content-primary"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs text-content-muted leading-relaxed">
          What would you like to edit? For example: "make chapter 1 simpler", "change chapter 3 to be about X instead", "merge chapters 5 and 6". Untouched chapters will be preserved.
        </p>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border-default/50 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border-default/50 bg-surface-raised px-3 py-2">
          <textarea
            ref={textareaRef}
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Change chapter 1 to be simpler..."
            rows={1}
            disabled={submitting}
            className="flex-1 resize-none bg-transparent text-sm text-content-primary placeholder:text-content-muted/50 outline-none disabled:opacity-50"
            style={{ maxHeight: '120px' }}
            onInput={e => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!feedback.trim() || submitting}
            aria-label="Send revision"
            className="rounded-md p-1 text-content-muted transition-colors hover:text-content-primary disabled:opacity-30"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
