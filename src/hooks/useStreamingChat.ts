import { useCallback, useRef, useState } from 'react'
import { apiUrl } from '@src/lib/api-base'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface UseStreamingChatOptions {
  model: string
  provider: string
  chapterContent: string
  selectedText: string
}

export function useStreamingChat({ model, provider, chapterContent, selectedText }: UseStreamingChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const streamChat = useCallback(async (userMessage: string, history: ChatMessage[]) => {
    setMessages([...history, { role: 'user', content: userMessage }, { role: 'assistant', content: '' }])
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

  const sendMessage = useCallback(async (userMessage: string) => {
    if (isStreaming) return
    streamChat(userMessage, [...messages])
  }, [isStreaming, messages, streamChat])

  const restartChat = useCallback((userMessage: string) => {
    abortRef.current?.abort()
    streamChat(userMessage, [])
  }, [streamChat])

  const clearMessages = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setIsStreaming(false)
  }, [])

  return { messages, isStreaming, sendMessage, restartChat, clearMessages }
}
