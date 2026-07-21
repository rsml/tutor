import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@client/lib/utils'
import type { Phase } from '@client/features/reader/ReaderPage'
import type { TocChapterSummary } from '@client/features/reader/hooks/useGenerationResume'

interface ChapterRailProps {
  phase: Phase
  tocChapters: TocChapterSummary[]
  generatedUpTo: number
  chapterIndex: number
  showToc: boolean
  setShowToc: Dispatch<SetStateAction<boolean>>
  goToChapter: (chapter: number, section?: number) => void
  chapterTabRefs: MutableRefObject<(HTMLButtonElement | null)[]>
  generatingTabLabel: number
  hasPrev: boolean
  hasNext: boolean
  goPrev: () => void
  goNext: () => void
}

/**
 * The top tab strip shown while reading or generating: a "Table of
 * Contents" toggle, one tab per generated chapter, and a spinner/error tab
 * for whichever chapter is currently generating.
 *
 * Non-obvious constraint: `tocNavRef` is assigned but never read anywhere,
 * including before this component existed, so it stays a local ref rather
 * than a prop. `chapterTabRefs`, by contrast, is read by ReaderPage's
 * tab-centering effect, so that ref object is owned by ReaderPage and must
 * be passed down rather than declared here.
 */
export function ChapterRail({
  phase,
  tocChapters,
  generatedUpTo,
  chapterIndex,
  showToc,
  setShowToc,
  goToChapter,
  chapterTabRefs,
  generatingTabLabel,
  hasPrev,
  hasNext,
  goPrev,
  goNext,
}: ChapterRailProps) {
  const tocNavRef = useRef<HTMLElement>(null)

  return (
    <div
      className="z-20 shrink-0 border-b border-border-default/50 bg-surface-base/90 backdrop-blur-sm"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div className="flex items-center justify-between">
        <nav ref={tocNavRef} tabIndex={-1} className="flex min-w-0 overflow-x-auto scrollbar-none outline-none focus:outline-none focus-visible:outline-none">
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => setShowToc(true)}
            tabIndex={-1}
            className={cn(
              'relative shrink-0 whitespace-nowrap px-4 py-2 text-xs font-medium transition-colors outline-none focus:outline-none focus-visible:outline-none',
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
            const isActive = !showToc && i === chapterIndex && phase === 'reading'
            return (
              <button
                key={i}
                ref={el => { chapterTabRefs.current[i] = el }}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { if (phase === 'generating' || phase === 'generation-error') return; setShowToc(false); goToChapter(i, 0) }}
                tabIndex={-1}
                className={cn(
                  'relative shrink-0 whitespace-nowrap px-4 py-2 text-xs font-medium transition-colors outline-none focus:outline-none focus-visible:outline-none',
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
          {(phase === 'generating' || phase === 'generation-error') && (
            <span
              className={cn(
                'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-4 py-2 text-xs font-medium text-content-primary',
              )}
            >
              {phase === 'generating' ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <AlertTriangle className="size-3 text-status-error" />
              )}
              Chapter {generatingTabLabel}
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
  )
}
