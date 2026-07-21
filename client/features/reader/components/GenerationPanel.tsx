import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@client/components/ui/button'
import { useAppSelector, selectReadingWidth } from '@client/store'
import { stripStreamingUnclosedMermaid } from '@client/features/markdown/strip-streaming-mermaid'
import { SafeMarkdown } from '@client/features/markdown/SafeMarkdown'
import type { Phase } from '@client/features/reader/ReaderPage'
import type { TocChapterSummary } from '@client/features/reader/hooks/useGenerationResume'

interface GenerationPanelProps {
  phase: Phase
  streamingContent: string
  generatingChapterNum: number | null
  tocChapters: TocChapterSummary[]
  chapterIndex: number
  generationStage: string | null
  generationError: string | null
  handleRetryGeneration: () => void
}

/**
 * Whatever the article body shows while a chapter is being written or after
 * that write failed. The caller only mounts this while phase is
 * 'generating' or 'generation-error', so the two are rendered as a single
 * branch here rather than two independently-gated blocks, matching how they
 * sat as adjacent siblings before this split.
 */
export function GenerationPanel({
  phase,
  streamingContent,
  generatingChapterNum,
  tocChapters,
  chapterIndex,
  generationStage,
  generationError,
  handleRetryGeneration,
}: GenerationPanelProps) {
  const readingWidth = useAppSelector(selectReadingWidth)

  if (phase === 'generating') {
    return (
      <div className="mx-auto px-8 pb-24" style={{ maxWidth: readingWidth }}>
        {streamingContent ? (
          <div className="reader-prose">
            <SafeMarkdown>{stripStreamingUnclosedMermaid(streamingContent)}</SafeMarkdown>
          </div>
        ) : (
          <div className="pt-8">
            <h1 className="text-2xl font-bold tracking-tight text-content-primary">
              {generatingChapterNum != null
                ? (tocChapters[generatingChapterNum - 1]?.title ?? `Chapter ${generatingChapterNum}`)
                : (tocChapters[chapterIndex + 1]?.title ?? `Chapter ${chapterIndex + 2}`)
              }
            </h1>
            <span className="mt-6 inline-block h-5 w-px animate-pulse bg-content-muted" />
          </div>
        )}
        {generationStage && (generationStage === 'saving' || generationStage === 'quiz') && (
          <div className="mt-8 flex items-center gap-2 text-content-muted/50 text-sm">
            <Loader2 className="size-3 animate-spin" />
            <span>{generationStage === 'saving' ? 'Saving chapter...' : 'Creating quiz...'}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto px-8 pb-24" style={{ maxWidth: readingWidth }}>
      <div className="pt-12">
        <div className="rounded-lg border border-status-error/20 bg-status-error/5 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-status-error shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-content-primary">Generation failed</h3>
              <p className="mt-1 text-sm text-content-muted">
                {generationError || 'An unexpected error occurred while generating this chapter.'}
              </p>
              <Button
                size="sm"
                onClick={handleRetryGeneration}
                className="mt-4 bg-[oklch(0.55_0.20_285)] text-white font-medium hover:bg-[oklch(0.50_0.22_285)]"
              >
                <RefreshCw className="size-3.5" data-icon="inline-start" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
