import { ArrowLeft, BarChart3, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@src/components/ui/button'
import { SelectionTooltip } from '@src/components/SelectionTooltip'
import { ChatPanel } from '@src/components/ChatPanel'
import { SettingsMenu } from '@src/components/SettingsMenu'
import { useTextSelection } from '@src/hooks/useTextSelection'
import { useSectionNavigation } from '@src/hooks/useSectionNavigation'
import { store, useAppDispatch, useAppSelector, setPosition, setChapterFeedback, setChapterQuizResult, recordQuizAttempt, selectFontSize, selectReadingWidth, selectFunctionModel } from '@src/store'
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

export function ReaderPage({ book, onBack, onQuizReview, onUpdateProfile }: {
  book: Book
  onBack: () => void
  onQuizReview?: () => void
  onUpdateProfile?: () => void
}) {
  const dispatch = useAppDispatch()
  const fontSize = useAppSelector(selectFontSize)
  const readingWidth = useAppSelector(selectReadingWidth)

  type Phase = 'reading' | 'quiz' | 'feedback' | 'generating' | 'final-quiz' | 'rating' | 'complete'
  const [phase, setPhase] = useState<Phase>('reading')
  const [generatedUpTo, setGeneratedUpTo] = useState(book.totalChapters)
  const [tocChapters, setTocChapters] = useState<{ title: string; description: string }[]>([])
  const [showToc, setShowToc] = useState(false)
  const [quizQuestions, setQuizQuestions] = useState<Array<{ question: string; options: string[]; correctIndex: number }>>([])
  const [quizAnswers, setQuizAnswers] = useState<number[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const streamingBufferRef = useRef('')
  const streamingRafRef = useRef<number | null>(null)
  const userHasScrolledRef = useRef(false)

  const [finalQuizQuestions, setFinalQuizQuestions] = useState<Array<{ question: string; options: string[]; correctIndex: number }>>([])
  const [finalQuizScore, setFinalQuizScore] = useState(0)
  const [finalQuizTotal, setFinalQuizTotal] = useState(0)
  const [bookRating, setBookRating] = useState(0)
  const [finalQuizLoading, setFinalQuizLoading] = useState(false)

  const { provider: genProvider, model: genModel } = useAppSelector(selectFunctionModel('generation'))
  const { provider: quizProvider, model: quizModel } = useAppSelector(selectFunctionModel('quiz'))

  useEffect(() => {
    fetch(apiUrl(`/api/books/${book.id}`))
      .then(res => res.json())
      .then(data => setGeneratedUpTo(data.generatedUpTo))
      .catch(() => {})
    fetch(apiUrl(`/api/books/${book.id}/toc`))
      .then(res => res.json())
      .then(data => setTocChapters(data.chapters?.map((c: { title: string; description?: string }) => ({ title: c.title, description: c.description ?? '' })) ?? []))
      .catch(() => {})
  }, [book.id])

  const {
    chapterIndex, sectionIndex, sections, currentSection,
    fullChapterContent, loading: chapterLoading,
    hasPrev, hasNext,
    isLastSectionOfLastGenerated, isLastSectionOfBook,
    isLastChapter,
    goNext, goPrev, goToChapter,
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
    } catch { /* fire-and-forget */ }

    setFinalQuizLoading(true)
    setPhase('final-quiz')
    scrollRef.current?.scrollTo({ top: 0 })

    try {
      const res = await fetch(apiUrl(`/api/books/${book.id}/final-quiz`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: quizModel, provider: quizProvider }),
      })
      if (res.ok) {
        const data = await res.json()
        setFinalQuizQuestions(data.questions)
      }
    } catch { /* fire-and-forget */ }
    setFinalQuizLoading(false)
  }, [book.id, chapterIndex, quizModel, quizProvider, dispatch])

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
    } catch { /* fire-and-forget */ }
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
    } catch { /* fire-and-forget */ }

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
        body: JSON.stringify({ model: genModel, provider: genProvider, quizModel, quizProvider }),
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
          } catch { /* fire-and-forget */ }
        }
      }
    } catch {
      setPhase('reading')
    }
  }, [book.id, chapterIndex, quizAnswers, genModel, genProvider, quizModel, quizProvider, dispatch])

  // Auto-scroll during streaming, but stop if user scrolls manually
  useEffect(() => {
    if (phase !== 'generating' || !streamingContent) return
    if (userHasScrolledRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [phase, streamingContent])

  // Detect user scroll during streaming to disable auto-scroll
  useEffect(() => {
    if (phase !== 'generating') {
      userHasScrolledRef.current = false
      return
    }
    const el = scrollRef.current
    if (!el) return
    let lastScrollTop = el.scrollTop
    let ticking = false
    const handleScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
        // User scrolled up (away from bottom) — they're reading
        if (el.scrollTop < lastScrollTop && !atBottom) {
          userHasScrolledRef.current = true
        }
        // User scrolled back to bottom — re-enable auto-scroll
        if (atBottom) {
          userHasScrolledRef.current = false
        }
        lastScrollTop = el.scrollTop
      })
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [phase])

  // Scroll to top on section change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [chapterIndex, sectionIndex])

  // Cmd+Left/Right keyboard navigation
  useEffect(() => {
    if (phase !== 'reading') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.metaKey && e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, goPrev, goNext])

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

        {/* Right controls */}
        <div
          className="ml-auto flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
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

      {/* Chapter tabs */}
      {(phase === 'reading' || phase === 'generating') && (
        <div
          className="z-20 shrink-0 border-b border-border-default/50 bg-surface-base/90 backdrop-blur-sm"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="flex items-center justify-between">
            <nav className="flex min-w-0 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setShowToc(true)}
                className={cn(
                  'relative shrink-0 whitespace-nowrap px-4 py-2 text-xs font-medium transition-colors',
                  showToc
                    ? 'text-content-primary'
                    : 'text-content-muted hover:text-content-secondary',
                )}
              >
                Table of Contents
                {showToc && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-content-primary rounded-full" />
                )}
              </button>
              {tocChapters.map((ch, i) => {
                const isGenerated = i < generatedUpTo
                if (!isGenerated) return null
                const isActive = !showToc && i === chapterIndex
                return (
                  <button
                    key={i}
                    onClick={() => { if (phase === 'generating') return; setShowToc(false); goToChapter(i, 0) }}
                    className={cn(
                      'relative shrink-0 whitespace-nowrap px-4 py-2 text-xs font-medium transition-colors',
                      isActive
                        ? 'text-content-primary'
                        : 'text-content-muted hover:text-content-secondary',
                    )}
                  >
                    Chapter {i + 1}
                    {isActive && (
                      <span className="absolute inset-x-0 -bottom-px h-0.5 bg-content-primary rounded-full" />
                    )}
                  </button>
                )
              })}
              {phase === 'generating' && (
                <span
                  className="relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-4 py-2 text-xs font-medium text-content-primary"
                >
                  <Loader2 className="size-3 animate-spin" />
                  Chapter {chapterIndex + 2}
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-content-primary rounded-full" />
                </span>
              )}
            </nav>
            <div className="flex shrink-0 items-center gap-0.5 pr-2">
              <button
                onClick={goPrev}
                disabled={!hasPrev}
                className={cn(
                  'rounded-md p-1 transition-colors',
                  hasPrev
                    ? 'text-content-muted hover:text-content-primary hover:bg-surface-muted/50'
                    : 'text-content-muted/20 cursor-default',
                )}
                aria-label="Previous section"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={goNext}
                disabled={!hasNext}
                className={cn(
                  'rounded-md p-1 transition-colors',
                  hasNext
                    ? 'text-content-muted hover:text-content-primary hover:bg-surface-muted/50'
                    : 'text-content-muted/20 cursor-default',
                )}
                aria-label="Next section"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

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
          {/* Scrollable chapter content */}
          <main
            ref={scrollRef}
            className="h-full overflow-y-auto pt-12"
          >
            <article ref={articleRef} style={{ fontSize: `${fontSize}px` }}>
              {phase === 'reading' && showToc && (
                <div className="mx-auto px-8 pb-24" style={{ maxWidth: readingWidth }}>
                  <h1 className="text-2xl font-bold tracking-tight text-content-primary">Table of Contents</h1>
                  <div className="mt-6 space-y-1">
                    {tocChapters.map((ch, i) => {
                      const isGenerated = i < generatedUpTo
                      return (
                        <button
                          key={i}
                          onClick={() => { if (isGenerated) { setShowToc(false); goToChapter(i, 0) } }}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors',
                            isGenerated
                              ? 'hover:bg-surface-muted/50 cursor-pointer'
                              : 'opacity-40 cursor-default',
                          )}
                        >
                          <span className="self-center text-sm font-medium text-content-muted w-10 shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-content-primary">{ch.title}</span>
                            {ch.description && (
                              <p className="mt-0.5 text-xs text-content-muted leading-relaxed">{ch.description}</p>
                            )}
                          </div>
                          {!isGenerated && (
                            <span className="text-xs text-content-faint shrink-0 pt-0.5">Not yet generated</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {phase === 'reading' && !showToc && (
                <div className="mx-auto px-8 pb-24" style={{ maxWidth: readingWidth }}>
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
                            {isLastSectionOfBook ? 'Finish Book' : 'Next Chapter'}
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
                <div className="mx-auto px-8 pb-24" style={{ maxWidth: readingWidth }}>
                  {streamingContent ? (
                    <div className="reader-prose">
                      <SafeMarkdown>{streamingContent}</SafeMarkdown>
                    </div>
                  ) : (
                    <div className="pt-8">
                      <h1 className="text-2xl font-bold tracking-tight text-content-primary">
                        {tocChapters[chapterIndex + 1]?.title ?? `Chapter ${chapterIndex + 2}`}
                      </h1>
                      <span className="mt-6 inline-block h-5 w-px animate-pulse bg-content-muted" />
                    </div>
                  )}
                </div>
              )}

              {phase === 'final-quiz' && (
                finalQuizLoading || finalQuizQuestions.length === 0 ? (
                  <div className="mx-auto px-8 py-8" style={{ maxWidth: readingWidth }}>
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
                  onUpdateProfile={onUpdateProfile ?? onBack}
                  onSkip={onBack}
                />
              )}
            </article>
          </main>

          {/* Left tap zone — previous section */}
          {hasPrev && (
            <div className="absolute inset-y-0 left-0 z-10 flex w-16 pointer-events-none items-center justify-center">
              <button
                className="pointer-events-auto cursor-pointer rounded-full bg-surface-muted/60 p-2 backdrop-blur-sm opacity-0 transition-opacity hover:opacity-100"
                onClick={goPrev}
                aria-label="Previous section"
              >
                <ChevronLeft className="size-5 text-content-muted" />
              </button>
            </div>
          )}

          {/* Right tap zone — next section */}
          {hasNext && (
            <div className="absolute inset-y-0 right-0 z-10 flex w-16 pointer-events-none items-center justify-center">
              <button
                className="pointer-events-auto cursor-pointer rounded-full bg-surface-muted/60 p-2 backdrop-blur-sm opacity-0 transition-opacity hover:opacity-100"
                onClick={goNext}
                aria-label="Next section"
              >
                <ChevronRight className="size-5 text-content-muted" />
              </button>
            </div>
          )}

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

