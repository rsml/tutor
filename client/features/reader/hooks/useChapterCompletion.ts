import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { saveChapterProgress, submitChapterFeedback, rateBook } from '@client/api'
import { setChapterFeedback, type AppDispatch } from '@client/store'
import type { Phase } from '@client/features/reader/ReaderPage'

export interface UseChapterCompletionOptions {
  bookId: string
  chapterIndex: number
  generatedUpTo: number
  quizAnswers: number[]
  finalQuizScore: number
  finalQuizTotal: number
  fetchFinalQuiz: () => Promise<void>
  dispatch: AppDispatch
  setPhase: Dispatch<SetStateAction<Phase>>
  setReadingPosition: (chapter: number, section?: number) => void
  startGenerationStream: () => Promise<void>
  scrollRef: RefObject<HTMLElement | null>
}

export interface UseChapterCompletionReturn {
  syncChapterCompleted: (chapterNum: number) => void
  handleFeedbackSubmit: (liked: string, disliked: string) => Promise<void>
  handleFinishBook: () => Promise<void>
  handleRatingSubmit: () => Promise<void>
  bookRating: number
  setBookRating: Dispatch<SetStateAction<number>>
}

/**
 * Owns the two ways a chapter (or the book) gets marked done: submitting
 * feedback to advance to the next chapter, and finishing the last chapter
 * to reach the rating step. Both report to the server fire-and-forget,
 * never blocking the reader's forward progress on that request settling.
 *
 * Non-obvious constraint: `syncChapterCompleted` is also called by
 * useReaderQuiz's handleKeepGoing. That hook can't depend on this one the
 * normal way, because this hook depends on state useReaderQuiz owns
 * (quizAnswers, fetchFinalQuiz, finalQuizScore, finalQuizTotal) and so must
 * be called after it. ReaderPage passes this hook's `syncChapterCompleted`
 * into that call as a plain argument instead of a hook dependency.
 */
export function useChapterCompletion({
  bookId,
  chapterIndex,
  generatedUpTo,
  quizAnswers,
  finalQuizScore,
  finalQuizTotal,
  fetchFinalQuiz,
  dispatch,
  setPhase,
  setReadingPosition,
  startGenerationStream,
  scrollRef,
}: UseChapterCompletionOptions): UseChapterCompletionReturn {
  const [bookRating, setBookRating] = useState(0)

  const syncChapterCompleted = useCallback((chapNum: number) => {
    saveChapterProgress(bookId, chapNum, { scroll: 1, completed: true, completedAt: new Date().toISOString() }).catch(() => {})
  }, [bookId])

  const handleFinishBook = useCallback(async () => {
    syncChapterCompleted(chapterIndex + 1)
    await fetchFinalQuiz()
  }, [chapterIndex, syncChapterCompleted, fetchFinalQuiz])

  const handleRatingSubmit = useCallback(async () => {
    try {
      await rateBook(bookId, { rating: bookRating, finalQuizScore, finalQuizTotal })
    } catch { /* fire-and-forget */ }
    setPhase('complete')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [bookId, bookRating, finalQuizScore, finalQuizTotal, setPhase, scrollRef])

  const handleFeedbackSubmit = useCallback(async (liked: string, disliked: string) => {
    dispatch(setChapterFeedback({ bookId, chapterNum: chapterIndex + 1, liked, disliked }))

    try {
      await submitChapterFeedback(bookId, chapterIndex + 1, { liked, disliked, quizAnswers })
    } catch { /* fire-and-forget */ }

    // If next chapter already exists, skip generation and advance directly
    if (chapterIndex + 2 <= generatedUpTo) {
      setReadingPosition(chapterIndex + 1, 0)
      setPhase('reading')
      scrollRef.current?.scrollTo({ top: 0 })
      return
    }

    await startGenerationStream()
  }, [bookId, chapterIndex, generatedUpTo, quizAnswers, dispatch, setReadingPosition, startGenerationStream, setPhase, scrollRef])

  return { syncChapterCompleted, handleFeedbackSubmit, handleFinishBook, handleRatingSubmit, bookRating, setBookRating }
}
