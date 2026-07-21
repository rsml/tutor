import { useCallback, useRef } from 'react'
import { createBookStream, reviseTocStream } from '@client/api'
import { useStreamingContent } from '@client/hooks/useStreamingContent'
import { toast } from '@client/lib/toast'
import type { CreateBookEvent, ReviseTocEvent } from '@shared/events'
import type { ProviderId } from '@shared/provider'
import type { Phase } from '@client/features/creation/components/CreationView'

interface UseTocStreamOptions {
  hasApiKey: boolean
  topic: string
  details: string
  chapterCount: number
  model: string
  provider: ProviderId
  quizModel: string
  quizProvider: ProviderId
  quizLength: number
  onBookCreated?: (bookId: string, title: string, totalChapters?: number) => void
  setPhase: (phase: Phase) => void
  setError: (message: string) => void
  setBookId: (id: string) => void
  setActiveTab: (tab: 'toc' | 'chapter') => void
}

/**
 * Owns the create-book and revise-toc streams, and the streaming buffer both
 * of them write table of contents markdown into as it arrives.
 */
export function useTocStream(options: UseTocStreamOptions) {
  const {
    hasApiKey, topic, details, chapterCount,
    model, provider, quizModel, quizProvider, quizLength,
    onBookCreated, setPhase, setError, setBookId, setActiveTab,
  } = options

  const toc = useStreamingContent()
  const tocScrollRef = useRef<HTMLDivElement>(null)

  const startGeneration = useCallback(async () => {
    if (!hasApiKey) {
      setError('Please set your API key in Settings first.')
      setPhase('error')
      return
    }

    try {
      await createBookStream(
        { topic, details, model, provider, quizModel, quizProvider, quizLength, chapterCount },
        (event: CreateBookEvent) => {
          switch (event.type) {
            case 'book_created':
              setBookId(event.bookId)
              onBookCreated?.(event.bookId, event.title, event.totalChapters)
              break

            case 'toc':
              toc.appendChunk(event.text)
              // Auto-scroll TOC
              requestAnimationFrame(() => {
                tocScrollRef.current?.scrollTo({ top: tocScrollRef.current!.scrollHeight })
              })
              break

            case 'toc_done':
              toc.flushNow()
              setBookId(event.bookId)
              setPhase('awaiting_approval')
              // No automatic startChapterGeneration anymore.
              break

            case 'done':
              // POST /api/books now ends after toc_done; this just closes the stream
              break

            case 'error':
              setError('Generation failed: ' + event.message)
              setPhase('error')
              break
          }
        },
      )
    } catch (err) {
      setError('Generation failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
      setPhase('error')
    }
  }, [hasApiKey, model, provider, quizModel, quizProvider, quizLength, chapterCount, topic, details, toc, onBookCreated, setPhase, setError, setBookId])

  const handleRevise = useCallback(async (id: string, feedback: string) => {
    setPhase('revising')
    setActiveTab('toc')
    // Clear the existing TOC content to make room for the streamed replacement
    toc.flushNow()
    toc.reset()
    try {
      await reviseTocStream(
        id,
        { feedback, model, provider },
        (event: ReviseTocEvent) => {
          switch (event.type) {
            case 'toc':
              toc.appendChunk(event.text)
              requestAnimationFrame(() => {
                tocScrollRef.current?.scrollTo({ top: tocScrollRef.current!.scrollHeight })
              })
              break
            case 'toc_revised':
              toc.flushNow()
              setPhase('awaiting_approval')
              break
            case 'error':
              toast.error('Revise failed: ' + event.message)
              setPhase('awaiting_approval')
              break
          }
        },
      )
    } catch (err) {
      toast.error('Revise failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
      setPhase('awaiting_approval')
    }
  }, [model, provider, toc, setPhase, setActiveTab])

  return { toc, tocScrollRef, startGeneration, handleRevise }
}
