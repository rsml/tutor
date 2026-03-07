import { ArrowLeft, BarChart3, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@src/components/ui/button'
import { SelectionTooltip } from '@src/components/SelectionTooltip'
import { ChatPanel } from '@src/components/ChatPanel'
import { SettingsMenu } from '@src/components/SettingsMenu'
import { useTextSelection } from '@src/hooks/useTextSelection'
import { useSectionNavigation } from '@src/hooks/useSectionNavigation'
import { store, useAppDispatch, useAppSelector, setPosition, setChapterFeedback, setChapterQuizResult, recordQuizAttempt, selectFontSize, selectModel, selectActiveProvider } from '@src/store'
import { apiUrl } from '@src/lib/api-base'
import { cn } from '@src/lib/utils'
import { SafeMarkdown } from '@src/components/SafeMarkdown'
import { QuizPanel } from '@src/components/QuizPanel'
import { FeedbackForm } from '@src/components/FeedbackForm'
import { StarRating } from '@src/components/StarRating'
import { BookCompleteSummary } from '@src/components/BookCompleteSummary'

interface Book {
  id: string
  title: string
  chaptersRead: number
  totalChapters: number
}

export function ReaderPage({ book, onBack, onQuizReview }: {
  book: Book
  onBack: () => void
  onQuizReview?: () => void
}) {
  const dispatch = useAppDispatch()
  const fontSize = useAppSelector(selectFontSize)

  type Phase = 'reading' | 'quiz' | 'feedback' | 'generating' | 'final-quiz' | 'rating' | 'complete'
  const [phase, setPhase] = useState<Phase>('reading')
  const [generatedUpTo, setGeneratedUpTo] = useState(book.totalChapters)
  const [quizQuestions, setQuizQuestions] = useState<Array<{ question: string; options: string[]; correctIndex: number }>>([])
  const [quizAnswers, setQuizAnswers] = useState<number[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const streamingBufferRef = useRef('')
  const streamingRafRef = useRef<number | null>(null)

  const [finalQuizQuestions, setFinalQuizQuestions] = useState<Array<{ question: string; options: string[]; correctIndex: number }>>([])
  const [finalQuizScore, setFinalQuizScore] = useState(0)
  const [finalQuizTotal, setFinalQuizTotal] = useState(0)
  const [bookRating, setBookRating] = useState(0)
  const [finalQuizLoading, setFinalQuizLoading] = useState(false)

  const model = useAppSelector(selectModel)
  const provider = useAppSelector(selectActiveProvider)

  useEffect(() => {
    fetch(apiUrl(`/api/books/${book.id}`))
      .then(res => res.json())
      .then(data => setGeneratedUpTo(data.generatedUpTo))
      .catch(() => {})
  }, [book.id])

  const {
    chapterIndex, sectionIndex, sections, currentSection,
    fullChapterContent, loading: chapterLoading,
    hasPrev, hasNext,
    isLastSectionOfLastGenerated, isLastSectionOfBook,
    isLastChapter, sectionLabel,
    goNext, goPrev,
  } = useSectionNavigation({ bookId: book.id, totalChapters: book.totalChapters, generatedUpTo })

  // Save initial position on mount
  useEffect(() => {
    const pos = store.getState().readingProgress.positions[book.id]
    if (!pos) {
      const initialChapter = book.chaptersRead > 0 ? book.chaptersRead - 1 : 0
      dispatch(setPosition({ bookId: book.id, chapter: initialChapter, section: 0 }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollRef = useRef<HTMLElement>(null)
  const articleRef = useRef<HTMLElement>(null)

  // Text selection
  const { selectedText, selectionRect, clearSelection } = useTextSelection(articleRef)

  // Chat panel
  const [chatOpen, setChatOpen] = useState(false)
  const [chatSelectedText, setChatSelectedText] = useState('')
  const [chatPrompt, setChatPrompt] = useState<string | null>(null)
  const [missingKeyAlert, setMissingKeyAlert] = useState(false)

  const handleSelectionAction = useCallback((prompt: string) => {
    setChatSelectedText(selectedText)
    setChatPrompt(prompt)
    setChatOpen(true)
    clearSelection()
  }, [selectedText, clearSelection])

  const handleCloseChat = useCallback(() => {
    setChatOpen(false)
    setChatPrompt(null)
  }, [])

  const syncChapterCompleted = useCallback((chapNum: number) => {
    fetch(apiUrl(`/api/books/${book.id}/progress/${chapNum}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scroll: 1, completed: true, completedAt: new Date().toISOString() }),
    }).catch(() => {})
  }, [book.id])

  const handleKeepGoing = useCallback(async () => {
    syncChapterCompleted(chapterIndex + 1)
    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/chapters/${chapterIndex + 1}/quiz`))
      if (res.ok) {
        const data = await res.json()
        if (data.questions?.length > 0) {
          setQuizQuestions(data.questions)
          setPhase('quiz')
          scrollRef.current?.scrollTo({ top: 0 })
          return
        }
      }
    } catch { /* empty */ }
    setPhase('feedback')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [book.id, chapterIndex, syncChapterCompleted])

  const handleFinishBook = useCallback(() => {
    syncChapterCompleted(chapterIndex + 1)
    setPhase('feedback')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [chapterIndex, syncChapterCompleted])

  const handleLastChapterFeedback = useCallback(async (liked: string, disliked: string) => {
    dispatch(setChapterFeedback({ bookId: book.id, chapterNum: chapterIndex + 1, liked, disliked }))

    try {
      await fetch(apiUrl(`/api/books/${book.id}/chapters/${chapterIndex + 1}/feedback`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked, disliked }),
      })
    } catch {}

    setFinalQuizLoading(true)
    setPhase('final-quiz')
    scrollRef.current?.scrollTo({ top: 0 })

    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/final-quiz`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, provider }),
      })
      if (res.ok) {
        const data = await res.json()
        setFinalQuizQuestions(data.questions)
      }
    } catch {}
    setFinalQuizLoading(false)
  }, [book.id, chapterIndex, model, provider, dispatch])

  const handleFinalQuizComplete = useCallback((answers: number[]) => {
    const score = answers.filter((a, i) => a === finalQuizQuestions[i].correctIndex).length
    setFinalQuizScore(score)
    setFinalQuizTotal(finalQuizQuestions.length)
    setPhase('rating')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [finalQuizQuestions])

  const handleRatingSubmit = useCallback(async () => {
    try {
      await fetch(apiUrl(`/api/books/${book.id}/rating`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: bookRating, finalQuizScore, finalQuizTotal }),
      })
    } catch {}
    setPhase('complete')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [book.id, bookRating, finalQuizScore, finalQuizTotal])

  const handleQuizComplete = useCallback((answers: number[]) => {
    setQuizAnswers(answers)
    // Store quiz results in Redux
    const result = {
      questions: quizQuestions.map((q, i) => ({
        ...q,
        userAnswer: answers[i],
        correct: answers[i] === q.correctIndex,
      })),
      score: answers.filter((a, i) => a === quizQuestions[i].correctIndex).length,
    }
    dispatch(setChapterQuizResult({ bookId: book.id, chapterNum: chapterIndex + 1, result }))
    // Also record in quiz history for review/retake tracking
    dispatch(recordQuizAttempt({
      bookId: book.id,
      chapterNum: chapterIndex + 1,
      questions: quizQuestions,
      answers,
    }))
    setPhase('feedback')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [quizQuestions, dispatch, book.id, chapterIndex])

  const handleQuizSkip = useCallback(() => {
    setQuizAnswers([])
    setPhase('feedback')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [])

  const handleFeedbackSubmit = useCallback(async (liked: string, disliked: string) => {
    // Store feedback in Redux
    dispatch(setChapterFeedback({ bookId: book.id, chapterNum: chapterIndex + 1, liked, disliked }))

    try {
      await fetch(apiUrl(`/api/books/${book.id}/chapters/${chapterIndex + 1}/feedback`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked, disliked, quizAnswers }),
      })
    } catch {}

    setPhase('generating')
    setStreamingContent('')
    streamingBufferRef.current = ''
    scrollRef.current?.scrollTo({ top: 0 })

    const flushBuffer = () => {
      setStreamingContent(streamingBufferRef.current)
      streamingRafRef.current = null
    }

    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/generate-next`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, provider }),
      })

      if (!res.ok || !res.body) throw new Error('Generation failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'chapter') {
              streamingBufferRef.current += data.text
              if (!streamingRafRef.current) {
                streamingRafRef.current = requestAnimationFrame(flushBuffer)
              }
            } else if (data.type === 'done') {
              if (streamingRafRef.current) cancelAnimationFrame(streamingRafRef.current)
              const nextIndex = chapterIndex + 1
              setGeneratedUpTo(data.chapterNum)
              dispatch(setPosition({ bookId: book.id, chapter: nextIndex, section: 0 }))
              setPhase('reading')
              scrollRef.current?.scrollTo({ top: 0 })
            } else if (data.type === 'error') {
              setPhase('reading')
            }
          } catch {}
        }
      }
    } catch {
      setPhase('reading')
    }
  }, [book.id, chapterIndex, quizAnswers, model, provider, dispatch])

  // Scroll to top on section change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [chapterIndex, sectionIndex])

  return (
    <div className="flex h-screen flex-col text-content-primary">
      {/* Header — drag region */}
      <header
        className="relative z-30 flex h-12 shrink-0 items-center border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          {book.title}
        </span>

        {/* Chapter nav */}
        <div
          className="ml-auto flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="mr-1 text-xs text-content-muted">
            {sectionLabel}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goPrev}
            disabled={!hasPrev}
            aria-label="Previous section"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goNext}
            disabled={!hasNext}
            aria-label="Next section"
          >
            <ChevronRight className="size-4" />
          </Button>
          {onQuizReview && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onQuizReview}
              aria-label="Quiz review"
            >
              <BarChart3 className="size-4" />
            </Button>
          )}
          <SettingsMenu subtle />
        </div>
      </header>

      {/* Content + chat panel in horizontal flex */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Back button — overlays top-left of content area */}
        <button
          onClick={onBack}
          className="absolute left-6 top-3 z-20 inline-flex items-center gap-1.5 p-2 text-content-muted/50 transition-colors hover:text-content-muted"
        >
          <ArrowLeft className="size-5" />
        </button>

        {/* Content area with edge tap zones */}
        <div className="relative flex-1 overflow-hidden">
          {/* Left tap zone — previous section */}
          {hasPrev && (
            <div
              className="absolute left-0 top-0 bottom-0 z-10 flex w-16 cursor-pointer items-center justify-center opacity-0 transition-opacity hover:opacity-100"
              onClick={goPrev}
            >
              <div className="rounded-full bg-surface-muted/60 p-2 backdrop-blur-sm">
                <ChevronLeft className="size-5 text-content-muted" />
              </div>
            </div>
          )}

          {/* Right tap zone — next section */}
          {hasNext && (
            <div
              className="absolute right-0 top-0 bottom-0 z-10 flex w-16 cursor-pointer items-center justify-center opacity-0 transition-opacity hover:opacity-100"
              onClick={goNext}
            >
              <div className="rounded-full bg-surface-muted/60 p-2 backdrop-blur-sm">
                <ChevronRight className="size-5 text-content-muted" />
              </div>
            </div>
          )}

          {/* Scrollable chapter content */}
          <main
            ref={scrollRef}
            className="h-full overflow-y-auto pt-12"
          >
            <article ref={articleRef} style={{ fontSize: `${fontSize}px` }}>
              {phase === 'reading' && (
                <div className="mx-auto max-w-2xl px-8 pb-24">
                  {/* Section progress dots */}
                  {sections.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5 py-1.5 border-b border-border-default/30">
                      {sections.map((_, i) => (
                        <div key={i} className={cn(
                          "h-1.5 rounded-full transition-all",
                          i === sectionIndex ? "w-4 bg-[oklch(0.55_0.20_285)]"
                            : i < sectionIndex ? "w-1.5 bg-content-muted/40"
                            : "w-1.5 bg-content-muted/20"
                        )} />
                      ))}
                    </div>
                  )}
                  {chapterLoading ? (
                    <div className="flex items-center gap-2 pt-12 text-content-muted">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">Loading chapter...</span>
                    </div>
                  ) : currentSection ? (
                    <>
                      <div className="reader-prose">
                        <SafeMarkdown>{currentSection.markdown}</SafeMarkdown>
                      </div>
                      {(isLastSectionOfLastGenerated || isLastSectionOfBook) && (
                        <div className="mt-12 flex justify-center">
                          <Button
                            size="lg"
                            onClick={isLastSectionOfBook ? handleFinishBook : handleKeepGoing}
                            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
                          >
                            {isLastSectionOfBook ? 'Finish Book' : 'Keep Going'}
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="pt-12 text-sm text-content-muted">
                      Chapter {chapterIndex + 1} hasn't been generated yet.
                    </p>
                  )}
                </div>
              )}

              {phase === 'quiz' && (
                <QuizPanel
                  questions={quizQuestions}
                  onComplete={handleQuizComplete}
                  onSkip={handleQuizSkip}
                />
              )}

              {phase === 'feedback' && (
                <FeedbackForm
                  chapterNum={chapterIndex + 1}
                  onSubmit={isLastChapter ? handleLastChapterFeedback : handleFeedbackSubmit}
                  submitLabel={isLastChapter ? 'Continue to Final Quiz' : undefined}
                />
              )}

              {phase === 'generating' && (
                <div className="mx-auto max-w-2xl px-8 pb-24">
                  {streamingContent ? (
                    <div className="reader-prose">
                      <SafeMarkdown>{streamingContent}</SafeMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-12 text-content-muted">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">Generating chapter {chapterIndex + 2}...</span>
                    </div>
                  )}
                </div>
              )}

              {phase === 'final-quiz' && (
                finalQuizLoading || finalQuizQuestions.length === 0 ? (
                  <div className="mx-auto max-w-2xl px-8 py-8">
                    <div className="flex items-center gap-2 pt-12 text-content-muted">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">Generating your final quiz...</span>
                    </div>
                  </div>
                ) : (
                  <QuizPanel
                    questions={finalQuizQuestions}
                    onComplete={handleFinalQuizComplete}
                    onSkip={() => {
                      setFinalQuizScore(0)
                      setFinalQuizTotal(finalQuizQuestions.length)
                      setPhase('rating')
                      scrollRef.current?.scrollTo({ top: 0 })
                    }}
                    title="Final Quiz"
                    subtitle={`Test your understanding across all ${book.totalChapters} chapters.`}
                  />
                )
              )}

              {phase === 'rating' && (
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
              )}

              {phase === 'complete' && (
                <BookCompleteSummary
                  title={book.title}
                  totalChapters={book.totalChapters}
                  rating={bookRating}
                  finalQuizScore={finalQuizScore}
                  finalQuizTotal={finalQuizTotal}
                  onBackToLibrary={onBack}
                />
              )}
            </article>
          </main>

          {/* Selection tooltip */}
          <SelectionTooltip
            selectedText={selectedText}
            selectionRect={selectionRect}
            onAction={handleSelectionAction}
          />
        </div>

        {/* Chat panel — sibling, pushes content */}
        <ChatPanel
          open={chatOpen}
          onClose={handleCloseChat}
          selectedText={chatSelectedText}
          chapterContent={fullChapterContent ?? ''}
          initialPrompt={chatPrompt}
          onMissingApiKey={() => setMissingKeyAlert(true)}
        />
      </div>

      {/* Missing API key nudge */}
      {missingKeyAlert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-xs"
          onClick={() => setMissingKeyAlert(false)}
        >
          <div className="rounded-xl border border-border-default bg-surface-overlay p-6 shadow-lg" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-content-primary">Set your API key in Settings to use chat features.</p>
            <button
              onClick={() => setMissingKeyAlert(false)}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

