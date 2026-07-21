import { useCallback, useRef, useState } from 'react'
import { streamChat } from '@client/api'
import type { ProviderId } from '@client/lib/providers'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  selectedText?: string
}

interface UseStreamingChatOptions {
  model: string
  provider: ProviderId
  chapterContent: string
  selectedText: string
  initialMessages?: ChatMessage[]
}

/**
 * Streams one chat reply at a time into the message list, keyed off an
 * AbortController this hook owns rather than the caller.
 *
 * restartChat() and clearMessages() are the only two ways a stream is
 * stopped early, and both do it by calling abort() on the controller from
 * the previous call. Nothing here aborts on unmount, so a component that
 * unmounts mid-reply leaves the request running until the server ends it.
 * On a genuine failure, meaning the caught error's name is not 'AbortError',
 * the placeholder assistant message is only overwritten with a generic
 * failure string if no content had arrived yet. Any text already streamed in
 * before the error is left in place rather than discarded.
 */
export function useStreamingChat({ model, provider, chapterContent, selectedText, initialMessages }: UseStreamingChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? [])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const streamReply = useCallback(async (userMessage: string, history: ChatMessage[], msgSelectedText?: string) => {
    const userMsg: ChatMessage = { role: 'user', content: userMessage }
    if (msgSelectedText) userMsg.selectedText = msgSelectedText
    setMessages([...history, userMsg, { role: 'assistant', content: '' }])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat(
        {
          model,
          provider,
          chapterContent,
          selectedText,
          userMessage,
          history: history.map(m => ({ role: m.role, content: m.content })),
          signal: controller.signal,
        },
        text => {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + text }
            }
            return updated
          })
        },
      )
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
    streamReply(userMessage, [...messages], msgSelectedText)
  }, [isStreaming, messages, streamReply])

  const restartChat = useCallback((userMessage: string, msgSelectedText?: string) => {
    abortRef.current?.abort()
    streamReply(userMessage, [], msgSelectedText)
  }, [streamReply])

  const clearMessages = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setIsStreaming(false)
  }, [])

  return { messages, isStreaming, sendMessage, restartChat, clearMessages }
}
