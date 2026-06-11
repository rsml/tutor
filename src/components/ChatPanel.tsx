import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, SendHorizontal, Copy, ClipboardCopy } from 'lucide-react'
import { ChatMessage } from '@src/components/ChatMessage'
import { toast } from '@src/lib/toast'
import { useStreamingChat } from '@src/hooks/useStreamingChat'
import { useAppDispatch, useAppSelector, selectHasApiKeyForFunction, selectFunctionModel, setChatMessages, selectChatMessages } from '@src/store'

interface ChatPanelProps {
  open: boolean
  onClose: () => void
  selectedText: string
  chapterContent: string
  initialPrompt: string | null
  chatKey: number
  onMissingApiKey: () => void
  bookId: string
}

export function ChatPanel({ open, onClose, selectedText, chapterContent, initialPrompt, chatKey, onMissingApiKey, bookId }: ChatPanelProps) {
  const dispatch = useAppDispatch()
  const hasApiKey = useAppSelector(selectHasApiKeyForFunction('chat'))
  const { provider, model } = useAppSelector(selectFunctionModel('chat'))
  const persistedMessages = useAppSelector(selectChatMessages(bookId))
  const { messages, isStreaming, sendMessage, restartChat } = useStreamingChat({
    model,
    provider,
    chapterContent,
    selectedText,
    initialMessages: persistedMessages.length > 0 ? persistedMessages : undefined,
  })
  const [input, setInput] = useState('')
  const [width, setWidth] = useState(420)
  const [contextMenu, setContextMenu] = useState<{ content: string; x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isDraggingRef = useRef(false)
  const sentInitialRef = useRef(false)
  const userHasScrolledRef = useRef(false)

  // Reset sentInitialRef when panel closes (but keep messages for persistence)
  useEffect(() => {
    if (!open) {
      sentInitialRef.current = false
    }
  }, [open])

  // Focus the input when the panel opens
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  // Sync messages to Redux for persistence (skip empty streaming placeholders)
  useEffect(() => {
    const completed = messages.filter(m => m.role === 'user' || m.content !== '')
    if (completed.length > 0) {
      dispatch(setChatMessages({ bookId, messages: completed }))
    }
  }, [messages, bookId, dispatch])

  // Reset when chatKey changes (new chat requested while panel is open)
  useEffect(() => {
    if (chatKey === 0) return // skip initial mount
    if (!open || !initialPrompt) return
    if (!hasApiKey) {
      onMissingApiKey()
      return
    }
    sentInitialRef.current = true
    restartChat(initialPrompt, selectedText || undefined)
  }, [chatKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Send initial prompt when panel opens with a new selection
  useEffect(() => {
    if (open && initialPrompt && !sentInitialRef.current) {
      if (!hasApiKey) {
        onMissingApiKey()
        return
      }
      sentInitialRef.current = true
      sendMessage(initialPrompt, selectedText || undefined)
    }
  }, [open, initialPrompt]) // eslint-disable-line react-hooks/exhaustive-deps

  // Smart auto-scroll: respect user's scroll position during streaming
  useEffect(() => {
    if (userHasScrolledRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let lastScrollTop = el.scrollTop
    let ticking = false
    const handleScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
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
  }, [])

  // Reset auto-scroll when new streaming starts
  useEffect(() => {
    if (isStreaming) userHasScrolledRef.current = false
  }, [isStreaming])

  // Resize handle — direct DOM manipulation for 60fps
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const panel = panelRef.current
    if (!panel) return
    const startWidth = panel.offsetWidth

    isDraggingRef.current = true
    panel.style.transition = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX
      const newWidth = Math.min(700, Math.max(320, startWidth + delta))
      panel.style.width = `${newWidth}px`
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      isDraggingRef.current = false
      // Sync final width to React state and restore transition
      const finalWidth = panel.offsetWidth
      panel.style.transition = ''
      setWidth(finalWidth)
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // Escape closes panel (or context menu if open)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (contextMenu) {
        setContextMenu(null)
        return
      }
      if (open) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose, contextMenu])

  // Close context menu on any click outside
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  const handleMessageContextMenu = useCallback((e: React.MouseEvent, content: string) => {
    e.preventDefault()
    setContextMenu({ content, x: e.clientX, y: e.clientY })
  }, [])

  const handleCopy = useCallback(() => {
    if (!contextMenu) return
    void navigator.clipboard.writeText(contextMenu.content)
    setContextMenu(null)
    toast.success('Copied chat to clipboard')
  }, [contextMenu])

  const handleCopyAll = useCallback(() => {
    const transcript = messages
      .filter(m => m.content)
      .map(m => `${m.role === 'user' ? 'You' : 'AI'}:\n${m.content}`)
      .join('\n\n')
    if (!transcript) return
    void navigator.clipboard.writeText(transcript)
    toast.success('Copied conversation to clipboard')
  }, [messages])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    if (!hasApiKey) {
      onMissingApiKey()
      return
    }
    sendMessage(trimmed)
    setInput('')
    // Autosize only runs on user input, so collapse the height manually; refocus
    // so clicking the send button doesn't strand focus on the button
    const el = inputRef.current
    if (el) {
      el.style.height = 'auto'
      el.focus()
    }
  }

  return (
    <div
      ref={panelRef}
      data-chat-panel
      className={`relative z-30 flex shrink-0 flex-col border-l border-border-default/50 bg-surface-base/95 backdrop-blur-sm transition-[width] duration-300 overflow-hidden ${
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
        <span className="text-sm font-medium text-content-primary">Chat</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleCopyAll}
            disabled={messages.filter(m => m.content).length === 0}
            title="Copy entire transcript"
            className="rounded-md p-1 text-content-muted transition-colors hover:text-content-primary disabled:opacity-30 disabled:hover:text-content-muted"
          >
            <ClipboardCopy className="size-4" />
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-content-muted transition-colors hover:text-content-primary"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            message={msg}
            onContextMenu={handleMessageContextMenu}
          />
        ))}
      </div>

      {/* Context menu — portal'd to body to escape the panel's containing block (backdrop-filter + overflow-hidden) */}
      {contextMenu && createPortal(
        <div
          ref={(el) => {
            if (!el) return
            const rect = el.getBoundingClientRect()
            const vw = window.innerWidth
            const vh = window.innerHeight
            let x = contextMenu.x
            let y = contextMenu.y
            if (x + rect.width > vw - 8) x = contextMenu.x - rect.width
            if (y + rect.height > vh - 8) y = contextMenu.y - rect.height
            if (x < 8) x = 8
            if (y < 8) y = 8
            el.style.left = `${x}px`
            el.style.top = `${y}px`
          }}
          className="fixed z-50 w-fit rounded-lg border border-border-default/50 bg-surface-base/95 backdrop-blur-md py-1 shadow-lg"
          style={{ left: -9999, top: -9999 }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-content-primary hover:bg-surface-muted transition-colors whitespace-nowrap"
          >
            <Copy className="size-3.5 text-content-muted shrink-0" />
            Copy
          </button>
        </div>,
        document.body
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-border-default/50 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border-default/50 bg-surface-raised px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder={messages.length === 0 ? "Ask a question..." : "Ask a follow-up..."}
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
