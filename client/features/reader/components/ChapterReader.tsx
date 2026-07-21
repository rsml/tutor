import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@client/components/ui/button'
import { useAppSelector, selectReadingWidth } from '@client/store'
import { cn } from '@client/lib/utils'
import { SafeMarkdown } from '@client/features/markdown/SafeMarkdown'
import type { Section } from '@client/lib/split-sections'

interface ChapterReaderProps {
  chapterIndex: number
  sections: Section[]
  sectionIndex: number
  chapterLoading: boolean
  currentSection: Section | null
  isLastSectionOfChapter: boolean
  isLastChapter: boolean
  isLastSectionOfBook: boolean
  generatedUpTo: number
  quizLoading: boolean
  hasPrev: boolean
  hasNext: boolean
  goPrev: () => void
  goNext: () => void
  handleFinishBook: () => Promise<void>
  handleKeepGoing: (syncChapterCompleted: (chapterNum: number) => void) => Promise<void>
  syncChapterCompleted: (chapterNum: number) => void
  handleRegenerateChapter: () => Promise<void>
}

/**
 * The reading phase's article body: the current section's markdown, the
 * section-progress dots, and whatever comes after the text, meaning a
 * Next Chapter/Finish Book button, prev/next section buttons, or (if the
 * chapter failed to load) a regenerate prompt.
 *
 * Non-obvious constraint: `handleKeepGoing` needs `syncChapterCompleted`
 * passed in explicitly rather than closed over, since the two hooks that
 * own them can't depend on each other directly — see useReaderQuiz's doc
 * comment for why.
 */
export function ChapterReader({
  chapterIndex,
  sections,
  sectionIndex,
  chapterLoading,
  currentSection,
  isLastSectionOfChapter,
  isLastChapter,
  isLastSectionOfBook,
  generatedUpTo,
  quizLoading,
  hasPrev,
  hasNext,
  goPrev,
  goNext,
  handleFinishBook,
  handleKeepGoing,
  syncChapterCompleted,
  handleRegenerateChapter,
}: ChapterReaderProps) {
  const readingWidth = useAppSelector(selectReadingWidth)

  return (
    <div className="mx-auto px-8 pb-24" style={{ maxWidth: readingWidth }}>
      <div className="pt-2 text-xs text-content-muted">
        Chapter {chapterIndex + 1}
      </div>
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
          {(isLastSectionOfChapter && !isLastChapter) || isLastSectionOfBook ? (
            <div className="mt-12 flex justify-center">
              <Button
                size="lg"
                onClick={isLastSectionOfBook ? handleFinishBook : () => handleKeepGoing(syncChapterCompleted)}
                disabled={quizLoading}
                className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
              >
                {quizLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                    Loading quiz...
                  </>
                ) : isLastSectionOfBook ? 'Finish Book' : 'Next Chapter'}
              </Button>
            </div>
          ) : (hasPrev || hasNext) && (
            <div className="mt-12 flex justify-between">
              {hasPrev ? (
                <Button variant="ghost" onClick={goPrev}>
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
              ) : <div />}
              {hasNext ? (
                <Button variant="ghost" onClick={goNext}>
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              ) : <div />}
            </div>
          )}
        </>
      ) : (
        <div className="pt-12 text-sm text-content-muted">
          {chapterIndex + 1 <= generatedUpTo ? (
            <div className="rounded-lg border border-status-error/20 bg-status-error/5 p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 text-status-error shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-content-primary">Chapter content missing</h3>
                  <p className="mt-1 text-sm text-content-muted">
                    This chapter's content could not be loaded. You can regenerate it.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleRegenerateChapter}
                    className="mt-4 bg-[oklch(0.55_0.20_285)] text-white font-medium hover:bg-[oklch(0.50_0.22_285)]"
                  >
                    <RefreshCw className="size-3.5" data-icon="inline-start" />
                    Regenerate Chapter
                  </Button>
                </div>
              </div>
            </div>
          ) : chapterIndex + 1 === generatedUpTo + 1 ? (
            <p>This chapter is ready to generate. Complete the previous chapter to continue.</p>
          ) : (
            <p>Complete earlier chapters first to unlock this one.</p>
          )}
        </div>
      )}
    </div>
  )
}
