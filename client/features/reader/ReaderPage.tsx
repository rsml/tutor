import { useCallback, useEffect, useRef, useState } from 'react'
import { ReaderHeader } from '@client/features/reader/components/ReaderHeader'
import { useTextSelection } from '@client/hooks/useTextSelection'
import { useSectionNavigation } from '@client/features/reader/hooks/useSectionNavigation'
import { useGenerationResume, type TocChapterSummary } from '@client/features/reader/hooks/useGenerationResume'
import { useExternalGenerationPoll } from '@client/features/reader/hooks/useExternalGenerationPoll'
import { useChapterGeneration } from '@client/features/reader/hooks/useChapterGeneration'
import { useReaderScroll } from '@client/features/reader/hooks/useReaderScroll'
import { useReaderQuiz } from '@client/features/reader/hooks/useReaderQuiz'
import { useChapterCompletion } from '@client/features/reader/hooks/useChapterCompletion'
import { useStreamingContent } from '@client/hooks/useStreamingContent'
import { store, useAppDispatch, useAppSelector, selectFontSize, selectQuizLength, selectFunctionModel } from '@client/store'
import type { LibraryBook } from '@shared/responses'
import { PAGE_SCROLL_FRACTION, READER_LINE_HEIGHT, LINE_SCROLL_LINES, PAGE_SCROLL_MS, LINE_SCROLL_MS } from '@client/lib/constants'
import { ChapterRail } from '@client/features/reader/components/ChapterRail'
import { ReaderBody } from '@client/features/reader/components/ReaderBody'
import { MissingApiKeyDialog } from '@client/features/reader/components/MissingApiKeyDialog'
import { useChapterAudio } from '@client/features/audiobook/hooks/useChapterAudio'

const VOICE_DISPLAY_NAMES: Record<string, string> = {
  am_michael: 'Michael', am_adam: 'Adam', am_onyx: 'Onyx',
  am_echo: 'Echo', am_eric: 'Eric', am_fenrir: 'Fenrir',
  am_liam: 'Liam', am_puck: 'Puck', am_santa: 'Santa',
  bm_george: 'George', bm_lewis: 'Lewis', bm_daniel: 'Daniel', bm_fable: 'Fable',
  af_heart: 'Heart', af_bella: 'Bella', af_nicole: 'Nicole',
  af_sarah: 'Sarah', af_sky: 'Sky',
  bf_emma: 'Emma', bf_alice: 'Alice',
}
function voiceNameFromId(id: string): string {
  return VOICE_DISPLAY_NAMES[id] ?? id.replace(/^[ab][fm]_/, '').replace(/^./, c => c.toUpperCase())
}

export type Phase = 'reading' | 'quiz' | 'feedback' | 'generating' | 'generation-error' | 'final-quiz' | 'rating' | 'complete'

export function ReaderPage({ book, onBack, onQuizReview, onUpdateProfile }: {
  book: LibraryBook
  onBack: () => void
  onQuizReview?: () => void
  onUpdateProfile?: () => void
}) {
  const dispatch = useAppDispatch()
  const fontSize = useAppSelector(selectFontSize)

  const [phase, setPhase] = useState<Phase>('reading')
  const [generatedUpTo, setGeneratedUpTo] = useState(book.totalChapters)
  const [tocChapters, setTocChapters] = useState<TocChapterSummary[]>([])
  const [showToc, setShowToc] = useState(false)
  const [generationStage, setGenerationStage] = useState<string | null>(null)
  const [generatingChapterNum, setGeneratingChapterNum] = useState<number | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const userHasScrolledRef = useRef(false)
  const bufferBoundaryRef = useRef(0)

  const streaming = useStreamingContent()

  const { provider: genProvider, model: genModel } = useAppSelector(selectFunctionModel('generation'))
  const { provider: quizProvider, model: quizModel } = useAppSelector(selectFunctionModel('quiz'))
  const quizLength = useAppSelector(selectQuizLength)

  const {
    chapterIndex, sectionIndex, sections, currentSection,
    fullChapterContent, loading: chapterLoading,
    hasPrev, hasNext,
    isLastSectionOfChapter, isLastSectionOfBook, isLastChapter,
    goNext, goPrev, goToChapter, setReadingPosition, clearCacheForChapter,
  } = useSectionNavigation({ bookId: book.id, totalChapters: book.totalChapters, generatedUpTo })

  // Save initial position on mount
  useEffect(() => {
    const pos = store.getState().readingProgress.positions[book.id]
    if (!pos) {
      const initialChapter = book.chaptersRead > 0 ? book.chaptersRead - 1 : 0
      setReadingPosition(initialChapter, 0)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollRef = useRef<HTMLElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const chapterTabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const { smoothScrollBy } = useReaderScroll({
    phase,
    streamingContent: streaming.content,
    scrollRef,
    userHasScrolledRef,
  })

  // Fetch book metadata (with merged generation status) and TOC on mount, and
  // reattach to a chapter generation already running server-side.
  useGenerationResume({
    bookId: book.id,
    streaming,
    setGeneratedUpTo,
    setGeneratingChapterNum,
    setPhase,
    setGenerationStage,
    setGenerationError,
    setTocChapters,
    setReadingPosition,
    bufferBoundaryRef,
    userHasScrolledRef,
    scrollRef,
  })

  // Poll for external chapter updates (e.g. from Claude Code via MCP)
  useExternalGenerationPoll({
    bookId: book.id,
    totalChapters: book.totalChapters,
    generatedUpTo,
    phase,
    setGeneratedUpTo,
  })

  const { startGenerationStream, handleRegenerateChapter, handleRetryGeneration } = useChapterGeneration({
    bookId: book.id,
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
  })

  // Text selection
  const { selectedText, selectionRect, clearSelection } = useTextSelection(articleRef)

  // Chat panel
  const [chatOpen, setChatOpen] = useState(false)
  const [chatSelectedText, setChatSelectedText] = useState('')
  const [chatPrompt, setChatPrompt] = useState<string | null>(null)
  const [chatKey, setChatKey] = useState(0)
  const [missingKeyAlert, setMissingKeyAlert] = useState(false)
  const handleSelectionAction = useCallback((prompt: string) => {
    setChatSelectedText(selectedText)
    setChatPrompt(prompt)
    setChatKey(k => k + 1)
    setChatOpen(true)
    clearSelection()
  }, [selectedText, clearSelection])

  const handleCloseChat = useCallback(() => {
    setChatOpen(false)
    setChatPrompt(null)
  }, [])

  const handleChatToggle = useCallback(() => {
    if (!chatOpen) {
      setChatSelectedText('')
      setChatPrompt(null)
    }
    setChatOpen(o => !o)
  }, [chatOpen])

  const {
    quizQuestions, quizAnswers, quizLoading,
    finalQuizQuestions, finalQuizScore, finalQuizTotal, finalQuizLoading, finalQuizError,
    handleKeepGoing, fetchFinalQuiz, handleFinalQuizComplete, handleFinalQuizSkip,
    handleQuizComplete, handleQuizSkip,
  } = useReaderQuiz({
    bookId: book.id,
    chapterIndex,
    quizModel,
    quizProvider,
    quizLength,
    dispatch,
    setPhase,
    scrollRef,
  })

  const {
    syncChapterCompleted, handleFeedbackSubmit, handleFinishBook, handleRatingSubmit,
    bookRating, setBookRating,
  } = useChapterCompletion({
    bookId: book.id,
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
  })

  // Scroll to top on section change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [chapterIndex, sectionIndex])

  // Center the active chapter tab in the TOC strip (instant — no animation)
  useEffect(() => {
    const btn = chapterTabRefs.current[chapterIndex]
    if (!btn) return
    btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' })
  }, [chapterIndex, tocChapters.length])

  // Keyboard navigation: arrows for sections/scrolling, Enter/Space for page-down
  useEffect(() => {
    if (phase !== 'reading') return

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (quizLoading) return
        if (isLastSectionOfBook) {
          handleFinishBook()
        } else if (isLastSectionOfChapter && !isLastChapter) {
          handleKeepGoing(syncChapterCompleted)
        } else {
          goNext()
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const el = scrollRef.current
        if (!el) return
        smoothScrollBy(el.clientHeight * PAGE_SCROLL_FRACTION, PAGE_SCROLL_MS)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        smoothScrollBy(fontSize * READER_LINE_HEIGHT * LINE_SCROLL_LINES, LINE_SCROLL_MS)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        smoothScrollBy(-fontSize * READER_LINE_HEIGHT * LINE_SCROLL_LINES, LINE_SCROLL_MS)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, goPrev, goNext, fontSize, smoothScrollBy, quizLoading, isLastSectionOfBook, isLastSectionOfChapter, isLastChapter, handleFinishBook, handleKeepGoing, syncChapterCompleted])

  // The chapter number to show on the generating tab
  const generatingTabLabel = generatingChapterNum ?? chapterIndex + 2

  const { hasAudio, status: audiobookStatus } = useChapterAudio(book.id)
  const currentChapterNum = chapterIndex + 1
  const voiceName = audiobookStatus?.manifest ? voiceNameFromId(audiobookStatus.manifest.voice) : undefined

  return (
    <div className="flex h-screen flex-col text-content-primary">
      <ReaderHeader
        title={book.title}
        onQuizReview={onQuizReview}
        chatOpen={chatOpen}
        onChatToggle={handleChatToggle}
      />

      {/* Chapter tabs */}
      {(phase === 'reading' || phase === 'generating' || phase === 'generation-error') && (
        <ChapterRail
          phase={phase}
          tocChapters={tocChapters}
          generatedUpTo={generatedUpTo}
          chapterIndex={chapterIndex}
          showToc={showToc}
          setShowToc={setShowToc}
          goToChapter={goToChapter}
          chapterTabRefs={chapterTabRefs}
          generatingTabLabel={generatingTabLabel}
          hasPrev={hasPrev}
          hasNext={hasNext}
          goPrev={goPrev}
          goNext={goNext}
        />
      )}

      {/* Content + chat panel in horizontal flex */}
      <ReaderBody
        onBack={onBack}
        phase={phase}
        showToc={showToc}
        bookId={book.id}
        currentChapterNum={currentChapterNum}
        voiceName={voiceName}
        audiobookStatus={audiobookStatus}
        hasAudio={hasAudio}
        tocChapters={tocChapters}
        generatedUpTo={generatedUpTo}
        setShowToc={setShowToc}
        goToChapter={goToChapter}
        chapterIndex={chapterIndex}
        sections={sections}
        sectionIndex={sectionIndex}
        chapterLoading={chapterLoading}
        currentSection={currentSection}
        isLastSectionOfChapter={isLastSectionOfChapter}
        isLastChapter={isLastChapter}
        isLastSectionOfBook={isLastSectionOfBook}
        quizLoading={quizLoading}
        hasPrev={hasPrev}
        hasNext={hasNext}
        goPrev={goPrev}
        goNext={goNext}
        handleFinishBook={handleFinishBook}
        handleKeepGoing={handleKeepGoing}
        syncChapterCompleted={syncChapterCompleted}
        handleRegenerateChapter={handleRegenerateChapter}
        quizQuestions={quizQuestions}
        handleQuizComplete={handleQuizComplete}
        handleQuizSkip={handleQuizSkip}
        handleFeedbackSubmit={handleFeedbackSubmit}
        streamingContent={streaming.content}
        generatingChapterNum={generatingChapterNum}
        generationStage={generationStage}
        generationError={generationError}
        handleRetryGeneration={handleRetryGeneration}
        finalQuizError={finalQuizError}
        finalQuizLoading={finalQuizLoading}
        finalQuizQuestions={finalQuizQuestions}
        finalQuizScore={finalQuizScore}
        finalQuizTotal={finalQuizTotal}
        fetchFinalQuiz={fetchFinalQuiz}
        handleFinalQuizSkip={handleFinalQuizSkip}
        handleFinalQuizComplete={handleFinalQuizComplete}
        bookTitle={book.title}
        totalChapters={book.totalChapters}
        bookRating={bookRating}
        setBookRating={setBookRating}
        handleRatingSubmit={handleRatingSubmit}
        onUpdateProfile={onUpdateProfile}
        scrollRef={scrollRef}
        articleRef={articleRef}
        fontSize={fontSize}
        selectedText={selectedText}
        selectionRect={selectionRect}
        handleSelectionAction={handleSelectionAction}
        clearSelection={clearSelection}
        chatOpen={chatOpen}
        handleCloseChat={handleCloseChat}
        chatSelectedText={chatSelectedText}
        fullChapterContent={fullChapterContent}
        chatPrompt={chatPrompt}
        chatKey={chatKey}
        onMissingApiKey={() => setMissingKeyAlert(true)}
      />

      {/* Missing API key nudge */}
      {missingKeyAlert && (
        <MissingApiKeyDialog onClose={() => setMissingKeyAlert(false)} />
      )}
    </div>
  )
}
