import type { Dispatch, SetStateAction } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@client/components/ui/button'
import { useAppSelector, selectReadingWidth } from '@client/store'
import { QuizPanel } from '@client/features/reader/components/QuizPanel'
import { StarRating } from '@client/features/reader/components/StarRating'
import { BookCompleteSummary } from '@client/features/reader/components/BookCompleteSummary'
import type { Phase } from '@client/features/reader/ReaderPage'
import type { QuizQuestion } from '@client/features/reader/hooks/useReaderQuiz'

interface EndOfBookFlowProps {
  phase: Phase
  finalQuizError: string | null
  finalQuizLoading: boolean
  finalQuizQuestions: QuizQuestion[]
  finalQuizScore: number
  finalQuizTotal: number
  fetchFinalQuiz: () => Promise<void>
  handleFinalQuizSkip: (total: number) => void
  handleFinalQuizComplete: (answers: number[]) => void
  bookTitle: string
  totalChapters: number
  bookRating: number
  setBookRating: Dispatch<SetStateAction<number>>
  handleRatingSubmit: () => Promise<void>
  onUpdateProfile?: () => void
  onBack: () => void
}

/**
 * Everything after the last chapter: the final quiz (or its loading/error
 * states), the book rating step, and the completion summary. The three
 * phases are mutually exclusive, so the caller gates all of them behind one
 * condition and this component picks the branch, matching how they sat as
 * adjacent sibling blocks before this split.
 */
export function EndOfBookFlow({
  phase,
  finalQuizError,
  finalQuizLoading,
  finalQuizQuestions,
  finalQuizScore,
  finalQuizTotal,
  fetchFinalQuiz,
  handleFinalQuizSkip,
  handleFinalQuizComplete,
  bookTitle,
  totalChapters,
  bookRating,
  setBookRating,
  handleRatingSubmit,
  onUpdateProfile,
  onBack,
}: EndOfBookFlowProps) {
  const readingWidth = useAppSelector(selectReadingWidth)

  if (phase === 'final-quiz') {
    if (finalQuizError) {
      return (
        <div className="mx-auto px-8 pb-24" style={{ maxWidth: readingWidth }}>
          <div className="pt-12">
            <div className="rounded-lg border border-status-error/20 bg-status-error/5 p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 text-status-error shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-content-primary">Final quiz generation failed</h3>
                  <p className="mt-1 text-sm text-content-muted">{finalQuizError}</p>
                  <div className="mt-4 flex items-center gap-3">
                    <Button
                      size="sm"
                      onClick={fetchFinalQuiz}
                      className="bg-[oklch(0.55_0.20_285)] text-white font-medium hover:bg-[oklch(0.50_0.22_285)]"
                    >
                      <RefreshCw className="size-3.5" data-icon="inline-start" />
                      Retry
                    </Button>
                    <button
                      onClick={() => handleFinalQuizSkip(0)}
                      className="text-sm text-content-muted hover:text-content-secondary transition-colors"
                    >
                      Skip quiz
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (finalQuizLoading || finalQuizQuestions.length === 0) {
      return (
        <div className="mx-auto px-8 py-8" style={{ maxWidth: readingWidth }}>
          <div className="flex items-center gap-2 pt-12 text-content-muted">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Generating your final quiz...</span>
          </div>
        </div>
      )
    }

    return (
      <QuizPanel
        questions={finalQuizQuestions}
        onComplete={handleFinalQuizComplete}
        onSkip={() => handleFinalQuizSkip(finalQuizQuestions.length)}
        title="Final Quiz"
        subtitle={`Test your understanding across all ${totalChapters} chapters.`}
      />
    )
  }

  if (phase === 'rating') {
    return (
      <div className="mx-auto max-w-md px-8 py-16 text-center">
        <h2 className="text-xl font-semibold tracking-tight">Rate this book</h2>
        <p className="mt-1 text-sm text-content-muted">
          How would you rate your learning experience?
        </p>
        <div className="mt-8 flex justify-center">
          <StarRating value={bookRating} onChange={setBookRating} size="lg" />
        </div>
        <div className="mt-8">
          <Button
            size="lg"
            onClick={handleRatingSubmit}
            disabled={bookRating === 0}
            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)] disabled:opacity-40"
          >
            Submit Rating
          </Button>
        </div>
      </div>
    )
  }

  return (
    <BookCompleteSummary
      title={bookTitle}
      totalChapters={totalChapters}
      rating={bookRating}
      finalQuizScore={finalQuizScore}
      finalQuizTotal={finalQuizTotal}
      onUpdateProfile={onUpdateProfile ?? onBack}
      onSkip={onBack}
    />
  )
}
