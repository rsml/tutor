import { useCallback, useEffect, useRef } from 'react'
import { startFirstChapterStream } from '@client/api'
import { useStreamingContent } from '@client/hooks/useStreamingContent'
import { CREATION_ADVANCE_MS } from '@client/lib/constants'
import type { StartBookEvent } from '@shared/events'
import type { ProviderId } from '@shared/provider'
import type { Phase } from '@client/features/creation/components/CreationView'

interface UseChapterOneStreamOptions {
  bookId: string | null
  model: string
  provider: ProviderId
  quizModel: string
  quizProvider: ProviderId
  quizLength: number
  onComplete: (bookId: string) => void
  phase: Phase
  setPhase: (phase: Phase) => void
  setError: (message: string) => void
  setActiveTab: (tab: 'toc' | 'chapter') => void
}

/**
 * Owns the first-chapter generation stream, the streaming buffer it writes
 * chapter text into, and the phase transitions around it, including the
 * auto-advance into the reader once the chapter finishes.
 *
 * Auto-advance is driven by a phase-driven effect rather than by the stream's
 * own 'done' handler, so it still fires correctly on Vite HMR if this
 * component remounts while phase is already 'done'.
 */
export function useChapterOneStream(options: UseChapterOneStreamOptions) {
  const {
    bookId, model, provider, quizModel, quizProvider, quizLength,
    onComplete, phase, setPhase, setError, setActiveTab,
  } = options

  const chapter = useStreamingContent()
  const chapterScrollRef = useRef<HTMLDivElement>(null)

  const handleGenerateChapter1 = useCallback(async (id: string) => {
    setPhase('starting')
    setActiveTab('chapter')
    try {
      await startFirstChapterStream(
        id,
        { model, provider, quizModel, quizProvider, quizLength },
        (event: StartBookEvent) => {
          switch (event.type) {
            case 'chapter':
              chapter.appendChunk(event.text)
              requestAnimationFrame(() => {
                chapterScrollRef.current?.scrollTo({ top: chapterScrollRef.current!.scrollHeight })
              })
              break
            case 'done':
              chapter.flushNow()
              setPhase('done')
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
  }, [model, provider, quizModel, quizProvider, quizLength, chapter, setPhase, setActiveTab, setError])

  // Auto-advance into the reader once chapter 1 has finished streaming.
  // Uses a phase-driven effect (not the SSE handler) so this also fires
  // correctly on Vite HMR if the component remounts while phase is already 'done'.
  useEffect(() => {
    if (phase !== 'done' || !bookId) return
    const t = setTimeout(() => onComplete(bookId), CREATION_ADVANCE_MS)
    return () => clearTimeout(t)
  }, [phase, bookId, onComplete])

  return { chapter, chapterScrollRef, handleGenerateChapter1 }
}
