import { useEffect, useRef, useState } from 'react'
import { X, SendHorizontal } from 'lucide-react'
import { ChatMessage } from '@src/components/ChatMessage'
import { useStreamingChat } from '@src/hooks/useStreamingChat'
import { useAppSelector, selectHasApiKey, selectModel, selectActiveProvider } from '@src/store'

interface ChatPanelProps {
  open: boolean
  onClose: () => void
  selectedText: string
  chapterContent: string
  initialPrompt: string | null
  onMissingApiKey: () => void
}

export function ChatPanel({ open, onClose, selectedText, chapterContent, initialPrompt, onMissingApiKey }: ChatPanelProps) {
  const hasApiKey = useAppSelector(selectHasApiKey)
  const model = useAppSelector(selectModel)
  const provider = useAppSelector(selectActiveProvider)
  const { messages, isStreaming, sendMessage, clearMessages } = useStreamingChat({
    model,
    provider,
    chapterContent,
    selectedText,
  })
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentInitialRef = useRef(false)

  // Send initial prompt when panel opens with a new selection
  useEffect(() => {
    if (open && initialPrompt && !sentInitialRef.current) {
      if (!hasApiKey) {
        onMissingApiKey()
        return
      }
      sentInitialRef.current = true
      sendMessage(initialPrompt)
    }
  }, [open, initialPrompt]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when panel closes
  useEffect(() => {
    if (!open) {
      sentInitialRef.current = false
      clearMessages()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Escape closes panel
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    if (!hasApiKey) {
      onMissingApiKey()
      return
    }
    sendMessage(trimmed)
    setInput('')
  }

  return (
    <div
      data-chat-panel
      className={`flex shrink-0 flex-col border-l border-border-default/50 bg-surface-base/95 backdrop-blur-sm transition-[width] duration-300 overflow-hidden ${
        open ? 'w-[420px]' : 'w-0 border-l-0'
      }`}
    >
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border-default/50 px-4">
        <span className="text-sm font-medium text-content-primary">Chat</span>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-content-muted transition-colors hover:text-content-primary"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            message={msg}
            selectedText={selectedText}
            isFirst={i === 0}
          />
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border-default/50 p-3">
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
            placeholder="Ask a follow-up..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-content-primary placeholder:text-content-muted/50 outline-none"
            style={{ maxHeight: '120px' }}
            onInput={e => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            className="rounded-md p-1 text-content-muted transition-colors hover:text-content-primary disabled:opacity-30"
          >
            <SendHorizontal className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
