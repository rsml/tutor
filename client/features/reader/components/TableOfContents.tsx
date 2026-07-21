import type { Dispatch, SetStateAction } from 'react'
import { useAppSelector, selectReadingWidth } from '@client/store'
import { cn } from '@client/lib/utils'
import type { Phase } from '@client/features/reader/ReaderPage'
import type { TocChapterSummary } from '@client/features/reader/hooks/useGenerationResume'

interface TableOfContentsProps {
  phase: Phase
  tocChapters: TocChapterSummary[]
  generatedUpTo: number
  setShowToc: Dispatch<SetStateAction<boolean>>
  goToChapter: (chapter: number, section?: number) => void
}

/**
 * The full-page chapter listing shown in place of the article body when the
 * reader opens "Table of Contents" from the rail. Only chapters already
 * generated, and only while actively reading rather than mid-generation,
 * are clickable — everything else renders dimmed as a preview of what's
 * still to come.
 */
export function TableOfContents({ phase, tocChapters, generatedUpTo, setShowToc, goToChapter }: TableOfContentsProps) {
  const readingWidth = useAppSelector(selectReadingWidth)

  return (
    <div className="mx-auto px-8 pb-24" style={{ maxWidth: readingWidth }}>
      <h1 className="text-2xl font-bold tracking-tight text-content-primary">Table of Contents</h1>
      <div className="mt-6 space-y-1">
        {tocChapters.map((ch, i) => {
          const isGenerated = i < generatedUpTo
          const isClickable = isGenerated && phase === 'reading'
          return (
            <button
              key={i}
              onClick={() => { if (isClickable) { setShowToc(false); goToChapter(i, 0) } }}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors',
                isClickable
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
  )
}
