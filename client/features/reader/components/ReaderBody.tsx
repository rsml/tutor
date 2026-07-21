import type { Dispatch, RefObject, SetStateAction } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ChatPanel } from '@client/features/chat/components/ChatPanel'
import { SelectionTooltip } from '@client/features/reader/components/SelectionTooltip'
import { ChapterListenButton } from '@client/features/reader/components/ChapterListenButton'
import { TableOfContents } from '@client/features/reader/components/TableOfContents'
import { ChapterReader } from '@client/features/reader/components/ChapterReader'
import { QuizPanel } from '@client/features/reader/components/QuizPanel'
import { FeedbackForm } from '@client/features/reader/components/FeedbackForm'
import { GenerationPanel } from '@client/features/reader/components/GenerationPanel'
import { EndOfBookFlow } from '@client/features/reader/components/EndOfBookFlow'
import { SectionTapZones } from '@client/features/reader/components/SectionTapZones'
import type { BookAudiobookStatus } from '@client/api'
import type { Section } from '@client/lib/split-sections'
import type { Phase } from '@client/features/reader/ReaderPage'
import type { TocChapterSummary } from '@client/features/reader/hooks/useGenerationResume'
import type { QuizQuestion } from '@client/features/reader/hooks/useReaderQuiz'

interface ReaderBodyProps {
  onBack: () => void

  // Audiobook listen button — shown only while reading, away from the TOC
  phase: Phase
  showToc: boolean
  bookId: string
  currentChapterNum: number
  voiceName: string | undefined
  audiobookStatus: BookAudiobookStatus | null
  hasAudio: (chapterNum: number) => boolean

  // Table of contents toggle + listing
  tocChapters: TocChapterSummary[]
  generatedUpTo: number
  setShowToc: Dispatch<SetStateAction<boolean>>
  goToChapter: (chapter: number, section?: number) => void

  // Chapter reading
  chapterIndex: number
  sections: Section[]
  sectionIndex: number
  chapterLoading: boolean
  currentSection: Section | null
  isLastSectionOfChapter: boolean
  isLastChapter: boolean
  isLastSectionOfBook: boolean
  quizLoading: boolean
  hasPrev: boolean
  hasNext: boolean
  goPrev: () => void
  goNext: () => void
  handleFinishBook: () => Promise<void>
  handleKeepGoing: (syncChapterCompleted: (chapterNum: number) => void) => Promise<void>
  syncChapterCompleted: (chapterNum: number) => void
  handleRegenerateChapter: () => Promise<void>

  // Chapter quiz + feedback
  quizQuestions: QuizQuestion[]
  handleQuizComplete: (answers: number[]) => void
  handleQuizSkip: () => void
  handleFeedbackSubmit: (liked: string, disliked: string) => Promise<void>

  // Generation
  streamingContent: string
  generatingChapterNum: number | null
  generationStage: string | null
  generationError: string | null
  handleRetryGeneration: () => void

  // End of book
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

  // Scaffolding
  scrollRef: RefObject<HTMLElement | null>
  articleRef: RefObject<HTMLElement | null>
  fontSize: number

  // Text selection
  selectedText: string
  selectionRect: DOMRect | null
  handleSelectionAction: (prompt: string) => void
  clearSelection: () => void

  // Chat panel
  chatOpen: boolean
  handleCloseChat: () => void
  chatSelectedText: string
  fullChapterContent: string | null
  chatPrompt: string | null
  chatKey: number
  onMissingApiKey: () => void
}

/**
 * Everything below the chapter rail: the back button and audio listen
 * button that overlay the content, the phase-driven article body (table of
 * contents, chapter text, chapter quiz, feedback, generation, and the
 * end-of-book flow), its edge tap zones and selection tooltip, and the chat
 * panel that shares this row so it can push the content over rather than
 * float on top of it.
 *
 * This component only arranges phase-gated children in place; it owns none
 * of their state; every prop here is a value or callback ReaderPage already
 * held before this split.
 */
export function ReaderBody({
  onBack,
  phase,
  showToc,
  bookId,
  currentChapterNum,
  voiceName,
  audiobookStatus,
  hasAudio,
  tocChapters,
  generatedUpTo,
  setShowToc,
  goToChapter,
  chapterIndex,
  sections,
  sectionIndex,
  chapterLoading,
  currentSection,
  isLastSectionOfChapter,
  isLastChapter,
  isLastSectionOfBook,
  quizLoading,
  hasPrev,
  hasNext,
  goPrev,
  goNext,
  handleFinishBook,
  handleKeepGoing,
  syncChapterCompleted,
  handleRegenerateChapter,
  quizQuestions,
  handleQuizComplete,
  handleQuizSkip,
  handleFeedbackSubmit,
  streamingContent,
  generatingChapterNum,
  generationStage,
  generationError,
  handleRetryGeneration,
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
  scrollRef,
  articleRef,
  fontSize,
  selectedText,
  selectionRect,
  handleSelectionAction,
  clearSelection,
  chatOpen,
  handleCloseChat,
  chatSelectedText,
  fullChapterContent,
  chatPrompt,
  chatKey,
  onMissingApiKey,
}: ReaderBodyProps) {
  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* Back button — overlays top-left of content area */}
      <button
        onClick={onBack}
        aria-label="Back to library"
        className="absolute left-6 top-3 z-20 inline-flex items-center gap-1.5 p-2 text-content-muted opacity-50 transition-all hover:opacity-100"
      >
        <ArrowLeft className="size-5" />
      </button>

      {phase === 'reading' && !showToc && (
        <ChapterListenButton
          bookId={bookId}
          chapterNum={currentChapterNum}
          voiceName={voiceName}
          generatedAt={audiobookStatus?.manifest?.generatedAt}
          startSec={audiobookStatus?.manifest?.chapters.find(c => c.num === currentChapterNum)?.startSec}
          durationSec={audiobookStatus?.manifest?.chapters.find(c => c.num === currentChapterNum)?.durationSec}
          available={hasAudio(currentChapterNum)}
        />
      )}

      {/* Content area with edge tap zones */}
      <div className="relative flex-1 overflow-hidden">
        {/* Scrollable chapter content */}
        <main
          ref={scrollRef}
          className="h-full overflow-y-auto pt-12"
        >
          <article ref={articleRef} style={{ fontSize: `${fontSize}px` }}>
            {(phase === 'reading' || phase === 'generating' || phase === 'generation-error') && showToc && (
              <TableOfContents
                phase={phase}
                tocChapters={tocChapters}
                generatedUpTo={generatedUpTo}
                setShowToc={setShowToc}
                goToChapter={goToChapter}
              />
            )}

            {phase === 'reading' && !showToc && (
              <ChapterReader
                chapterIndex={chapterIndex}
                sections={sections}
                sectionIndex={sectionIndex}
                chapterLoading={chapterLoading}
                currentSection={currentSection}
                isLastSectionOfChapter={isLastSectionOfChapter}
                isLastChapter={isLastChapter}
                isLastSectionOfBook={isLastSectionOfBook}
                generatedUpTo={generatedUpTo}
                quizLoading={quizLoading}
                hasPrev={hasPrev}
                hasNext={hasNext}
                goPrev={goPrev}
                goNext={goNext}
                handleFinishBook={handleFinishBook}
                handleKeepGoing={handleKeepGoing}
                syncChapterCompleted={syncChapterCompleted}
                handleRegenerateChapter={handleRegenerateChapter}
              />
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
                onSubmit={handleFeedbackSubmit}
                submitLabel={chapterIndex + 2 <= generatedUpTo ? 'Next Chapter' : undefined}
              />
            )}

            {(phase === 'generating' || phase === 'generation-error') && !showToc && (
              <GenerationPanel
                phase={phase}
                streamingContent={streamingContent}
                generatingChapterNum={generatingChapterNum}
                tocChapters={tocChapters}
                chapterIndex={chapterIndex}
                generationStage={generationStage}
                generationError={generationError}
                handleRetryGeneration={handleRetryGeneration}
              />
            )}

            {(phase === 'final-quiz' || phase === 'rating' || phase === 'complete') && (
              <EndOfBookFlow
                phase={phase}
                finalQuizError={finalQuizError}
                finalQuizLoading={finalQuizLoading}
                finalQuizQuestions={finalQuizQuestions}
                finalQuizScore={finalQuizScore}
                finalQuizTotal={finalQuizTotal}
                fetchFinalQuiz={fetchFinalQuiz}
                handleFinalQuizSkip={handleFinalQuizSkip}
                handleFinalQuizComplete={handleFinalQuizComplete}
                bookTitle={bookTitle}
                totalChapters={totalChapters}
                bookRating={bookRating}
                setBookRating={setBookRating}
                handleRatingSubmit={handleRatingSubmit}
                onUpdateProfile={onUpdateProfile}
                onBack={onBack}
              />
            )}
          </article>
        </main>

        <SectionTapZones hasPrev={hasPrev} hasNext={hasNext} goPrev={goPrev} goNext={goNext} />

        {/* Selection tooltip */}
        <SelectionTooltip
          selectedText={selectedText}
          selectionRect={selectionRect}
          onAction={handleSelectionAction}
          clearSelection={clearSelection}
        />
      </div>

      {/* Chat panel — sibling, pushes content */}
      <ChatPanel
        open={chatOpen}
        onClose={handleCloseChat}
        selectedText={chatSelectedText}
        chapterContent={fullChapterContent ?? ''}
        initialPrompt={chatPrompt}
        chatKey={chatKey}
        onMissingApiKey={onMissingApiKey}
        bookId={bookId}
      />
    </div>
  )
}
