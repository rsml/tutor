import { useCallback, useRef, useState } from 'react'
import { apiUrl } from '@src/lib/api-base'
import type { ChatMessage } from '@src/hooks/useStreamingChat'

interface ProfileResult {
  aboutMe: string
  preferences: Record<string, boolean | number>
}

export function useInterviewChat({ model, provider }: { model: string; provider: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (userMessage: string) => {
    if (isStreaming || isComplete) return

    const userMsg: ChatMessage = { role: 'user', content: userMessage }
    const history = messages.map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(apiUrl('/api/profile/interview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, provider, userMessage, history }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error(`Interview request failed: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const parsed = JSON.parse(line)
            if (parsed.type === 'text') {
              setMessages(prev => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + parsed.content }
                }
                return updated
              })
            } else if (parsed.type === 'profile_complete') {
              setProfileResult(parsed.profile)
              setIsComplete(true)
            }
          } catch {
            // skip unparseable lines
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer)
          if (parsed.type === 'text') {
            setMessages(prev => {
              const updated = [...prev]
              const last = updated[updated.length - 1]
              if (last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: last.content + parsed.content }
              }
              return updated
            })
          } else if (parsed.type === 'profile_complete') {
            setProfileResult(parsed.profile)
            setIsComplete(true)
          }
        } catch {
          // ignore
        }
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
