import { useEffect, useRef, useState } from 'react'
import { X, SendHorizontal, CheckCircle2 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { ChatMessage } from '@src/components/ChatMessage'
import { useInterviewChat } from '@src/hooks/useInterviewChat'
import { useAppSelector, selectHasApiKey, selectModel, selectActiveProvider } from '@src/store'

interface InterviewPanelProps {
  open: boolean
  onClose: (profileUpdated: boolean) => void
  onMissingApiKey: () => void
}

export function InterviewPanel({ open, onClose, onMissingApiKey }: InterviewPanelProps) {
  const hasApiKey = useAppSelector(selectHasApiKey)
  const model = useAppSelector(selectModel)
  const provider = useAppSelector(selectActiveProvider)
  const { messages, isStreaming, isComplete, profileResult, sendMessage, clearMessages } = useInterviewChat({ model, provider })
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentInitialRef = useRef(false)

  // Auto-start interview when panel opens
  useEffect(() => {
    if (open && !sentInitialRef.current) {
      if (!hasApiKey) {
        onMissingApiKey()
        return
      }
      sentInitialRef.current = true
      sendMessage("Hi, I'd like to set up my learning profile.")
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when panel closes
  useEffect(() => {
    if (!open) {
      sentInitialRef.current = false
      clearMessages()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Escape closes
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose(!!profileResult)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose, profileResult])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming || isComplete) return
    if (!hasApiKey) {
      onMissingApiKey()
      return
    }
    sendMessage(trimmed)
    setInput('')
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={() => onClose(!!profileResult)}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-border-default/50 bg-surface-base/95 backdrop-blur-md shadow-2xl">
        {/* Header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border-default/50 px-4">
          <span className="text-sm font-medium text-content-primary">Learning Profile Interview</span>
          <button
            onClick={() => onClose(!!profileResult)}
            className="rounded-md p-1 text-content-muted transition-colors hover:text-content-primary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}

          {isComplete && (
            <div className="flex items-center gap-2 rounded-xl border border-status-ok/30 bg-status-ok/10 px-4 py-3 text-sm text-content-primary">
              <CheckCircle2 className="size-4 shrink-0 text-status-ok" />
              Profile saved successfully!
            </div>
          )}
        </div>

        {/* Input / Done */}
        <div className="shrink-0 border-t border-border-default/50 p-3">
          {isComplete ? (
            <Button className="w-full" onClick={() => onClose(true)}>
              Done
            </Button>
          ) : (
            <div className="flex items-end gap-2 rounded-xl border border-border-default/50 bg-surface-raised px-3 py-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder="Your answer..."
                rows={1}
                disabled={isStreaming}
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
                disabled={!input.trim() || isStreaming || isComplete}
                className="rounded-md p-1 text-content-muted transition-colors hover:text-content-primary disabled:opacity-30"
              >
                <SendHorizontal className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
