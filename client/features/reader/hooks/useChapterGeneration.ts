import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import { streamNextChapter, streamChapterRegeneration } from '@client/api'
import type { useStreamingContent } from '@client/hooks/useStreamingContent'
import type { Phase } from '@client/features/reader/ReaderPage'
import type { ProviderId } from '@client/lib/providers'

export interface UseChapterGenerationOptions {
  bookId: string
  chapterIndex: number
  generatedUpTo: number
  genModel: string
  genProvider: ProviderId
  quizModel: string
  quizProvider: ProviderId
  quizLength: number
  streaming: ReturnType<typeof useStreamingContent>
  setPhase: Dispatch<SetStateAction<Phase>>
  setGeneratedUpTo: Dispatch<SetStateAction<number>>
  setGeneratingChapterNum: Dispatch<SetStateAction<number | null>>
  setGenerationStage: Dispatch<SetStateAction<string | null>>
  setGenerationError: Dispatch<SetStateAction<string | null>>
  setReadingPosition: (chapter: number, section?: number) => void
  clearCacheForChapter: (chapterIndex: number) => void
  bufferBoundaryRef: MutableRefObject<number>
  userHasScrolledRef: MutableRefObject<boolean>
  scrollRef: RefObject<HTMLElement | null>
}

export interface UseChapterGenerationReturn {
  startGenerationStream: () => Promise<void>
  handleRegenerateChapter: () => Promise<void>
  handleRetryGeneration: () => void
}

/**
 * Streams a chapter into existence, either the next one in sequence or a
 * regeneration of the current one, and exposes the retry that feedback's
 * error state uses to re-run whichever of the two just failed.
 *
 * Non-obvious constraint: a thrown ApiError's message is the server's real
 * failure reason and is shown to the reader as-is (see `@client/api`'s
 * ApiError) — there is deliberately no generic fallback string here to mask
 * it. Both streams reset the same buffered-content bookkeeping
 * (`bufferBoundaryRef`, `userHasScrolledRef`) that useGenerationResume seeds
 * on reconnect, so a fresh, non-buffered stream always autoscrolls from the
 * top.
 */
export function useChapterGeneration({
  bookId,
  chapterIndex,
  generatedUpTo,
  genModel,
  genProvider,
  quizModel,
  quizProvider,
  quizLength,
  streaming,
  setPhase,
  setGeneratedUpTo,
  setGeneratingChapterNum,
  setGenerationStage,
  setGenerationError,
  setReadingPosition,
  clearCacheForChapter,
  bufferBoundaryRef,
  userHasScrolledRef,
  scrollRef,
}: UseChapterGenerationOptions): UseChapterGenerationReturn {
  // Start generation stream (used by feedback submit and retry)
  const startGenerationStream = useCallback(async () => {
    setPhase('generating')
    streaming.reset()
    setGenerationStage(null)
    setGenerationError(null)
    setGeneratingChapterNum(generatedUpTo + 1)
    bufferBoundaryRef.current = 0
    userHasScrolledRef.current = false
    scrollRef.current?.scrollTo({ top: 0 })

    try {
      await streamNextChapter(
        bookId,
        { model: genModel, provider: genProvider, quizModel, quizProvider, quizLength },
        (event) => {
          if (event.type === 'chapter') {
            streaming.appendChunk(event.text)
          } else if (event.type === 'stage') {
            setGenerationStage(event.stage)
          } else if (event.type === 'done' && event.chapterNum != null) {
            streaming.flushNow()
            setGenerationStage(null)
            setGeneratedUpTo(event.chapterNum)
            setGeneratingChapterNum(null)
            setReadingPosition(event.chapterNum - 1, 0)
            setPhase('reading')
            scrollRef.current?.scrollTo({ top: 0 })
          } else if (event.type === 'error') {
            setGenerationStage(null)
            setGenerationError(event.message)
            setPhase('generation-error')
          }
        },
      )
    } catch (err) {
      setGenerationStage(null)
      setGenerationError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      setPhase('generation-error')
    }
  }, [bookId, generatedUpTo, genModel, genProvider, quizModel, quizProvider, quizLength, setReadingPosition, streaming, setPhase, setGeneratedUpTo, setGeneratingChapterNum, setGenerationStage, setGenerationError, bufferBoundaryRef, userHasScrolledRef, scrollRef])

  const handleRetryGeneration = useCallback(() => {
    startGenerationStream()
  }, [startGenerationStream])

  const handleRegenerateChapter = useCallback(async () => {
    const chapterNum = chapterIndex + 1
    setPhase('generating')
    streaming.reset()
    setGenerationStage(null)
    setGenerationError(null)
    setGeneratingChapterNum(chapterNum)
    bufferBoundaryRef.current = 0
    userHasScrolledRef.current = false
    scrollRef.current?.scrollTo({ top: 0 })

    try {
      await streamChapterRegeneration(
        bookId,
        chapterNum,
        { model: genModel, provider: genProvider, quizModel, quizProvider, quizLength },
        (event) => {
          if (event.type === 'chapter') {
            streaming.appendChunk(event.text)
          } else if (event.type === 'stage') {
            setGenerationStage(event.stage)
          } else if (event.type === 'done' && event.chapterNum != null) {
            streaming.flushNow()
            setGenerationStage(null)
            setGeneratingChapterNum(null)
            clearCacheForChapter(chapterIndex)
            setReadingPosition(chapterIndex, 0)
            setPhase('reading')
            scrollRef.current?.scrollTo({ top: 0 })
          } else if (event.type === 'error') {
            setGenerationStage(null)
            setGenerationError(event.message)
            setPhase('generation-error')
          }
        },
      )
    } catch (err) {
      setGenerationStage(null)
      setGenerationError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      setPhase('generation-error')
    }
  }, [bookId, chapterIndex, genModel, genProvider, quizModel, quizProvider, quizLength, setReadingPosition, streaming, clearCacheForChapter, setPhase, setGeneratingChapterNum, setGenerationStage, setGenerationError, bufferBoundaryRef, userHasScrolledRef, scrollRef])

  return { startGenerationStream, handleRegenerateChapter, handleRetryGeneration }
}
