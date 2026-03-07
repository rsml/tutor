import { useCallback, useRef, useState } from 'react'
import { apiUrl } from '@src/lib/api-base'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  selectedText?: string
}

interface UseStreamingChatOptions {
  model: string
  provider: string
  chapterContent: string
  selectedText: string
  initialMessages?: ChatMessage[]
}

export function useStreamingChat({ model, provider, chapterContent, selectedText, initialMessages }: UseStreamingChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? [])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const streamChat = useCallback(async (userMessage: string, history: ChatMessage[], msgSelectedText?: string) => {
    const userMsg: ChatMessage = { role: 'user', content: userMessage }
    if (msgSelectedText) userMsg.selectedText = msgSelectedText
    setMessages([...history, userMsg, { role: 'assistant', content: '' }])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          provider,
          chapterContent,
          selectedText,
          userMessage,
          history: history.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error(`Chat request failed: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + text }
          }
          return updated
        })
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = { ...last, content: 'Something went wrong. Please try again.' }
          }
          return updated
        })
      }
    } finally {
      if (abortRef.current === controller) {
        setIsStreaming(false)
        abortRef.current = null
      }
    }
  }, [model, provider, chapterContent, selectedText])

  const sendMessage = useCallback(async (userMessage: string, msgSelectedText?: string) => {
    if (isStreaming) return
    streamChat(userMessage, [...messages], msgSelectedText)
  }, [isStreaming, messages, streamChat])

  const restartChat = useCallback((userMessage: string, msgSelectedText?: string) => {
    abortRef.current?.abort()
    streamChat(userMessage, [], msgSelectedText)
  }, [streamChat])

  const clearMessages = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setIsStreaming(false)
  }, [])

  return { messages, isStreaming, sendMessage, restartChat, clearMessages }
}
