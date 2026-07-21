import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { toast } from '@client/lib/toast'
import { ApiError, generateFinalQuiz, getChapterQuiz } from '@client/api'
import { setChapterQuizResult, recordQuizAttempt, type AppDispatch } from '@client/store'
import type { Phase } from '@client/features/reader/ReaderPage'
import type { ProviderId } from '@client/lib/providers'

/** Mirrors QuizPanel's own local question shape rather than importing the
 *  wider server QuizQuestion type, which carries optional grading fields
 *  this reader only fills in after the reader answers. */
export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
}

export interface UseReaderQuizOptions {
  bookId: string
  chapterIndex: number
  quizModel: string
  quizProvider: ProviderId
  quizLength: number
  dispatch: AppDispatch
  setPhase: Dispatch<SetStateAction<Phase>>
  scrollRef: RefObject<HTMLElement | null>
}

export interface UseReaderQuizReturn {
  quizQuestions: QuizQuestion[]
  quizAnswers: number[]
  quizLoading: boolean
  finalQuizQuestions: QuizQuestion[]
  finalQuizScore: number
  finalQuizTotal: number
  finalQuizLoading: boolean
  finalQuizError: string | null
  handleKeepGoing: (syncChapterCompleted: (chapterNum: number) => void) => Promise<void>
  fetchFinalQuiz: () => Promise<void>
  handleFinalQuizComplete: (answers: number[]) => void
  handleFinalQuizSkip: (total: number) => void
  handleQuizComplete: (answers: number[]) => void
  handleQuizSkip: () => void
}

/**
 * Owns both quizzes a reader can hit: the short per-chapter quiz offered
 * between chapters, and the whole-book final quiz offered after the last
 * one.
 *
 * Non-obvious constraint: `handleKeepGoing` cannot close over a
 * `syncChapterCompleted` the normal way, since that callback is owned by
 * useChapterCompletion, and useChapterCompletion in turn depends on this
 * hook's own state (quizAnswers, fetchFinalQuiz, finalQuizScore,
 * finalQuizTotal), so it has to be called after this one. Taking
 * `syncChapterCompleted` as a call-time argument instead of a hook
 * dependency breaks that cycle without either hook reaching into the
 * other's internals.
 */
export function useReaderQuiz({
  bookId,
  chapterIndex,
  quizModel,
  quizProvider,
  quizLength,
  dispatch,
  setPhase,
  scrollRef,
}: UseReaderQuizOptions): UseReaderQuizReturn {
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [quizAnswers, setQuizAnswers] = useState<number[]>([])
  const [quizLoading, setQuizLoading] = useState(false)

  const [finalQuizQuestions, setFinalQuizQuestions] = useState<QuizQuestion[]>([])
  const [finalQuizScore, setFinalQuizScore] = useState(0)
  const [finalQuizTotal, setFinalQuizTotal] = useState(0)
  const [finalQuizLoading, setFinalQuizLoading] = useState(false)
  const [finalQuizError, setFinalQuizError] = useState<string | null>(null)

  const handleKeepGoing = useCallback(async (syncChapterCompleted: (chapterNum: number) => void) => {
    syncChapterCompleted(chapterIndex + 1)
    setQuizLoading(true)
    try {
      const data = await getChapterQuiz(bookId, chapterIndex + 1, { model: quizModel, provider: quizProvider, quizLength })
      if (data.questions.length > 0) {
        setQuizQuestions(data.questions)
        setQuizLoading(false)
        setPhase('quiz')
        scrollRef.current?.scrollTo({ top: 0 })
        return
      }
    } catch (err) {
      // A non-2xx answer (ApiError) degrades to feedback the same way an
      // empty question list does, silently. Only a genuine transport failure
      // (no response at all) is worth telling the reader about.
      if (!(err instanceof ApiError)) {
        toast.error('Failed to load quiz — skipping to feedback')
      }
    }
    setQuizLoading(false)
    setPhase('feedback')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [bookId, chapterIndex, quizModel, quizProvider, quizLength, setPhase, scrollRef])

  const fetchFinalQuiz = useCallback(async () => {
    setFinalQuizLoading(true)
    setFinalQuizError(null)
    setPhase('final-quiz')
    scrollRef.current?.scrollTo({ top: 0 })

    try {
      const data = await generateFinalQuiz(bookId, { model: quizModel, provider: quizProvider })
      setFinalQuizQuestions(data.questions)
    } catch (err) {
      setFinalQuizError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    }
    setFinalQuizLoading(false)
  }, [bookId, quizModel, quizProvider, setPhase, scrollRef])

  const handleFinalQuizComplete = useCallback((answers: number[]) => {
    const score = answers.filter((a, i) => a === finalQuizQuestions[i].correctIndex).length
    setFinalQuizScore(score)
    setFinalQuizTotal(finalQuizQuestions.length)
    setPhase('rating')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [finalQuizQuestions, setPhase, scrollRef])

  // Unifies the final quiz's two skip paths, which previously duplicated
  // these same four lines inline with only the total argument differing:
  // the error panel's "Skip quiz" link has no loaded questions to count (0),
  // while the quiz panel's own skip button has a full set to count instead.
  const handleFinalQuizSkip = useCallback((total: number) => {
    setFinalQuizScore(0)
    setFinalQuizTotal(total)
    setPhase('rating')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [setPhase, scrollRef])

  const handleQuizComplete = useCallback((answers: number[]) => {
    setQuizAnswers(answers)
    const result = {
      questions: quizQuestions.map((q, i) => ({
        ...q,
        userAnswer: answers[i],
        correct: answers[i] === q.correctIndex,
      })),
      score: answers.filter((a, i) => a === quizQuestions[i].correctIndex).length,
    }
    dispatch(setChapterQuizResult({ bookId, chapterNum: chapterIndex + 1, result }))
    dispatch(recordQuizAttempt({
      bookId,
      chapterNum: chapterIndex + 1,
      questions: quizQuestions,
      answers,
    }))
    setPhase('feedback')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [quizQuestions, dispatch, bookId, chapterIndex, setPhase, scrollRef])

  const handleQuizSkip = useCallback(() => {
    setQuizAnswers([])
    setPhase('feedback')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [setPhase, scrollRef])

  return {
    quizQuestions,
    quizAnswers,
    quizLoading,
    finalQuizQuestions,
    finalQuizScore,
    finalQuizTotal,
    finalQuizLoading,
    finalQuizError,
    handleKeepGoing,
    fetchFinalQuiz,
    handleFinalQuizComplete,
    handleFinalQuizSkip,
    handleQuizComplete,
    handleQuizSkip,
  }
}
