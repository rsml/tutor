import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { NoiseOverlay } from '@src/components/NoiseOverlay'
import { ChapterBreakdownList } from '@src/components/ChapterBreakdownList'
import { QuizPanel } from '@src/components/QuizPanel'
import { SmartReviewFlow, type ReviewQuestion } from '@src/components/SmartReviewFlow'
import { apiUrl } from '@src/lib/api-base'
import { useAppSelector, useAppDispatch, recordQuizAttempt } from '@src/store'
import { selectBookQuizSummary, selectSmartReviewQueue } from '@src/store/quizHistorySelectors'
import type { ChapterQuiz } from '@src/store/quizHistorySlice'

interface QuizReviewBook {
  id: string
  title: string
  totalChapters: number
}

type SortMode = 'weakest' | 'chapter-order'

export function QuizReviewPage({ book, onBack, onBackToReader }: {
  book: QuizReviewBook
  onBack: () => void
  onBackToReader: () => void
}) {
  const [sortMode, setSortMode] = useState<SortMode>('weakest')
  const [retakeChapter, setRetakeChapter] = useState<number | null>(null)
  const [smartReviewActive, setSmartReviewActive] = useState(false)
  const summary = useAppSelector(selectBookQuizSummary(book.id))
  const smartReviewQueue = useAppSelector(selectSmartReviewQueue(book.id))
  const bookQuizzes = useAppSelector(s => s.quizHistory.quizzes[book.id] ?? {}) as Record<string, ChapterQuiz>
  const [tocTitles, setTocTitles] = useState<Record<string, string>>({})
  const dispatch = useAppDispatch()

  // Fetch TOC for chapter titles
  useEffect(() => {
    fetch(apiUrl(`/api/books/${book.id}/toc`))
      .then(res => res.json())
      .then(data => {
        const titles: Record<string, string> = {}
        data.chapters?.forEach((ch: { title: string }, i: number) => {
          titles[String(i + 1)] = ch.title
        })
        setTocTitles(titles)
      })
      .catch(() => {})
  }, [book.id])

  const handleRetake = (chapterNum: number) => setRetakeChapter(chapterNum)

  const handleRetakeComplete = (answers: number[]) => {
    if (retakeChapter === null) return
    const quiz = bookQuizzes[String(retakeChapter)]
    if (!quiz) return
    dispatch(recordQuizAttempt({
      bookId: book.id,
      chapterNum: retakeChapter,
      questions: quiz.questions,
      answers,
    }))
    setRetakeChapter(null)
  }

  const handleSmartReviewRecord = useCallback((chapterNum: number, questions: ReviewQuestion[], answers: number[]) => {
    dispatch(recordQuizAttempt({
      bookId: book.id,
      chapterNum,
      questions: questions.map(q => ({ question: q.question, options: q.options, correctIndex: q.correctIndex })),
      answers,
    }))
  }, [dispatch, book.id])

  return (
    <div className="flex h-screen flex-col text-content-primary">
      <NoiseOverlay />

      {/* Header */}
      <header
        className="relative z-30 flex h-12 shrink-0 items-center border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 p-1 text-content-muted/50 transition-colors hover:text-content-muted"
          >
            <ArrowLeft className="size-4" />
          </button>
        </div>

        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          {book.title} — Quiz Review
        </span>

        <div className="ml-auto flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex rounded-lg border border-border-default/50 text-xs">
            <button
              onClick={() => setSortMode('weakest')}
              className={`px-2.5 py-1 rounded-l-lg transition-colors ${sortMode === 'weakest' ? 'bg-surface-muted text-content-primary' : 'text-content-muted hover:text-content-secondary'}`}
            >
              Weakest first
            </button>
            <button
              onClick={() => setSortMode('chapter-order')}
              className={`px-2.5 py-1 rounded-r-lg transition-colors ${sortMode === 'chapter-order' ? 'bg-surface-muted text-content-primary' : 'text-content-muted hover:text-content-secondary'}`}
            >
              Chapter order
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl">
          {!summary.hasAnyData ? (
            <div className="flex flex-col items-center gap-3 pt-24 text-content-muted">
              <BarChart3 className="size-10 text-content-faint" />
              <p className="text-sm">Complete chapter quizzes to see your review.</p>
              <Button variant="outline" size="sm" onClick={onBackToReader}>
                Back to reading
              </Button>
            </div>
          ) : (
            <>
              {/* Summary strip */}
              <SummaryStrip
                bookId={book.id}
                correct={summary.correct}
                total={summary.total}
                chaptersToReview={summary.chaptersToReview}
              />

              {smartReviewQueue.length > 0 && !retakeChapter && !smartReviewActive && (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => setSmartReviewActive(true)}
                    className="bg-[oklch(0.55_0.20_285)] text-white hover:bg-[oklch(0.50_0.22_285)]"
                  >
                    Smart Review ({smartReviewQueue.length} question{smartReviewQueue.length > 1 ? 's' : ''})
                  </Button>
                </div>
              )}

              {/* Chapter breakdown / retake / smart review */}
              {smartReviewActive ? (
                <SmartReviewFlow
                  queue={smartReviewQueue}
                  tocTitles={tocTitles}
                  onRecordAttempt={handleSmartReviewRecord}
                  onComplete={() => setSmartReviewActive(false)}
                />
              ) : retakeChapter !== null && bookQuizzes[String(retakeChapter)] ? (
                <div className="mt-4">
                  <button
                    onClick={() => setRetakeChapter(null)}
                    className="mb-4 text-sm text-content-muted hover:text-content-secondary transition-colors"
                  >
                    &larr; Back to review
                  </button>
                  <QuizPanel
                    key={retakeChapter}
                    questions={bookQuizzes[String(retakeChapter)].questions}
                    onComplete={handleRetakeComplete}
                    onSkip={() => setRetakeChapter(null)}
                    title={`Retake — ${tocTitles[String(retakeChapter)] || `Chapter ${retakeChapter}`}`}
                    subtitle="Same questions, fresh attempt. Let's see if you improved."
                  />
                </div>
              ) : (
                <ChapterBreakdownList
                  bookId={book.id}
                  chapters={bookQuizzes}
                  tocTitles={tocTitles}
                  sortMode={sortMode}
                  onRetake={handleRetake}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function SummaryStrip({ bookId, correct, total, chaptersToReview }: {
  bookId: string
  correct: number
  total: number
  chaptersToReview: number
}) {
  const bookQuizzes = useAppSelector(s => s.quizHistory.quizzes[bookId] ?? {})

  // Build per-question correctness array from latest attempts, in chapter order
  const segments: boolean[] = []
  const sortedKeys = Object.keys(bookQuizzes).sort((a, b) => parseInt(a) - parseInt(b))
  for (const key of sortedKeys) {
    const ch = bookQuizzes[key]
    const latest = ch.attempts[ch.attempts.length - 1]
    if (latest) {
      for (const a of latest.answers) {
        segments.push(a.correct)
      }
    }
  }

  return (
    <div className="flex items-center gap-6 rounded-xl border border-border-default/50 bg-surface-raised/50 px-5 py-3">
      {/* Segmented bar */}
      <div className="flex gap-0.5" role="img" aria-label={`${correct} of ${total} correct`}>
        {segments.map((isCorrect, i) => (
          <div
            key={i}
            className={`h-3 w-2 rounded-sm ${isCorrect ? 'bg-green-500/70' : 'bg-red-500/40'}`}
          />
        ))}
      </div>

      <span className="text-sm font-medium text-content-primary">
        {correct}/{total} correct
      </span>

      {chaptersToReview > 0 && (
        <span className="text-sm text-content-muted">
          {chaptersToReview} {chaptersToReview === 1 ? 'chapter' : 'chapters'} to review
        </span>
      )}
    </div>
  )
}
