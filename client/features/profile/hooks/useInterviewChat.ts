import { useCallback, useRef, useState } from 'react'
import { streamInterview, type InterviewValue, type ProfileResponse } from '@client/api'
import type { ProviderId } from '@client/lib/providers'
import type { ChatMessage } from '@client/features/chat/hooks/useStreamingChat'

export function useInterviewChat({ model, provider }: { model: string; provider: ProviderId }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [profileResult, setProfileResult] = useState<ProfileResponse | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (userMessage: string) => {
    if (isStreaming || isComplete) return

    const userMsg: ChatMessage = { role: 'user', content: userMessage }
    const history = messages.map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    const handleValue = (value: InterviewValue) => {
      if (value.type === 'text') {
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + value.content }
          }
          return updated
        })
      } else {
        setProfileResult(value.profile)
        setIsComplete(true)
      }
    }

    try {
      await streamInterview({ model, provider, userMessage, history }, handleValue, controller.signal)
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
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [model, provider, messages, isStreaming, isComplete])

  const clearMessages = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setIsStreaming(false)
    setIsComplete(false)
    setProfileResult(null)
  }, [])

  return { messages, isStreaming, isComplete, profileResult, sendMessage, clearMessages }
}
