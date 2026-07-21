import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@client/components/ui/button'
import { SafeMarkdown } from '@client/features/markdown/SafeMarkdown'
import { ReviseTocPanel } from '@client/features/creation/components/ReviseTocPanel'
import { useTocStream } from '@client/features/creation/hooks/useTocStream'
import { useChapterOneStream } from '@client/features/creation/hooks/useChapterOneStream'
import { useAppSelector, selectHasApiKeyForFunction, selectFunctionModel, selectFontSize, selectQuizLength } from '@client/store'
import { getBook, getToc } from '@client/api'
import { formatTocAsMarkdown } from '@client/lib/format-toc'

export type Phase = 'toc' | 'awaiting_approval' | 'revising' | 'starting' | 'done' | 'error'

export type CreationViewProps =
  | {
      mode: 'create'
      topic: string
      details: string
      chapterCount: number
      onComplete: (bookId: string) => void
      onCancel: () => void
      onBookCreated?: (bookId: string, title: string, totalChapters?: number) => void
    }
  | {
      mode: 'resume'
      bookId: string
      onComplete: (bookId: string) => void
      onCancel: () => void
    }

export function CreationView(props: CreationViewProps) {
  const { onComplete, onCancel } = props
  // Mode-specific fields — only meaningful when mode === 'create'
  const topic = props.mode === 'create' ? props.topic : ''
  const details = props.mode === 'create' ? props.details : ''
  const chapterCount = props.mode === 'create' ? props.chapterCount : 0
  const onBookCreated = props.mode === 'create' ? props.onBookCreated : undefined
  const resumeBookId = props.mode === 'resume' ? props.bookId : null

  const hasApiKey = useAppSelector(selectHasApiKeyForFunction('generation'))
  const { provider, model } = useAppSelector(selectFunctionModel('generation'))
  const { provider: quizProvider, model: quizModel } = useAppSelector(selectFunctionModel('quiz'))
  const quizLength = useAppSelector(selectQuizLength)
  const fontSize = useAppSelector(selectFontSize)

  const [phase, setPhase] = useState<Phase>('toc')
  const [activeTab, setActiveTab] = useState<'toc' | 'chapter'>('toc')
  const [bookId, setBookId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const startedRef = useRef(false)

  const { toc, tocScrollRef, startGeneration, handleRevise } = useTocStream({
    hasApiKey, topic, details, chapterCount,
    model, provider, quizModel, quizProvider, quizLength,
    onBookCreated, setPhase, setError, setBookId, setActiveTab,
  })

  const { chapter, chapterScrollRef, handleGenerateChapter1 } = useChapterOneStream({
    bookId, model, provider, quizModel, quizProvider, quizLength,
    onComplete, phase, setPhase, setError, setActiveTab,
  })

  const resumeFromExisting = useCallback(async (id: string) => {
    try {
      const [book, tocData] = await Promise.all([
        getBook(id),
        getToc(id),
      ])

      setBookId(id)
      // Reconstruct the TOC markdown and put it into the streaming buffer
      const md = formatTocAsMarkdown({
        title: book.title,
        subtitle: book.subtitle,
        chapters: tocData.chapters,
      })
      toc.appendChunk(md)
      toc.flushNow()
      setPhase('awaiting_approval')
    } catch (err) {
      setError('Failed to resume: ' + (err instanceof Error ? err.message : 'Unknown error'))
      setPhase('error')
    }
  }, [toc])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    if (resumeBookId) {
      resumeFromExisting(resumeBookId)
    } else {
      startGeneration()
    }
  }, [startGeneration, resumeFromExisting, resumeBookId])

  const chapterTabAvailable = phase === 'starting' || phase === 'done' || chapter.content.length > 0

  return (
    <div className="flex h-screen flex-col text-content-primary">
      {/* Header — spans full width */}
      <header
        className="relative z-30 flex h-12 shrink-0 items-center border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          Creating Book
        </span>
      </header>

      {/* Tabs — span full width */}
      <div className="flex shrink-0 border-b border-border-default/50 px-4">
        <button
          onClick={() => setActiveTab('toc')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'toc'
              ? 'text-content-primary'
              : 'text-content-muted hover:text-content-secondary'
          }`}
        >
          Table of Contents
          {activeTab === 'toc' && (
            <span className="absolute bottom-0 inset-x-2 h-0.5 rounded-full bg-[oklch(0.55_0.20_285)]" />
          )}
          {phase === 'toc' && (
            <Loader2 className="ml-1.5 inline size-3 animate-spin text-content-muted" />
          )}
        </button>
        <button
          onClick={() => chapterTabAvailable && setActiveTab('chapter')}
          disabled={!chapterTabAvailable}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            !chapterTabAvailable
              ? 'cursor-not-allowed text-content-muted/40'
              : activeTab === 'chapter'
              ? 'text-content-primary'
              : 'text-content-muted hover:text-content-secondary'
          }`}
        >
          Chapter 1
          {activeTab === 'chapter' && chapterTabAvailable && (
            <span className="absolute bottom-0 inset-x-2 h-0.5 rounded-full bg-[oklch(0.55_0.20_285)]" />
          )}
          {phase === 'starting' && (
            <Loader2 className="ml-1.5 inline size-3 animate-spin text-content-muted" />
          )}
        </button>
      </div>

      {/* Body — content + slide-out panel side-by-side, below header & tabs */}
      <div className="flex flex-1 overflow-hidden">
      <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        {/* Back button — overlays top-left of content area */}
        <button
          onClick={onCancel}
          aria-label="Back to library"
          className="absolute left-6 top-3 z-20 inline-flex items-center gap-1.5 p-2 text-content-muted opacity-50 transition-all hover:opacity-100"
        >
          <ArrowLeft className="size-5" />
        </button>

        {/* TOC page */}
        <div
          ref={tocScrollRef}
          className={`absolute inset-0 overflow-y-auto transition-opacity duration-200 ${
            activeTab === 'toc' ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="mx-auto max-w-2xl px-8 py-8">
            {toc.content ? (
              <div className="creation-markdown" style={{ fontSize: `${fontSize}px` }}>
                <SafeMarkdown>{toc.content}</SafeMarkdown>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-content-muted">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Generating table of contents...</span>
              </div>
            )}
          </div>
        </div>

        {/* Chapter page */}
        <div
          ref={chapterScrollRef}
          className={`absolute inset-0 overflow-y-auto transition-opacity duration-200 ${
            activeTab === 'chapter' ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="mx-auto max-w-2xl px-8 py-8">
            {chapter.content ? (
              <div className="creation-markdown" style={{ fontSize: `${fontSize}px` }}>
                <SafeMarkdown>{chapter.content}</SafeMarkdown>
              </div>
            ) : phase === 'starting' ? (
              <div className="flex items-center gap-2 text-content-muted">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Generating chapter 1...</span>
              </div>
            ) : phase === 'toc' ? (
              <p className="text-sm text-content-muted">
                Waiting for table of contents to finish...
              </p>
            ) : (
              <p className="text-sm text-content-muted">
                Approve the table of contents to generate Chapter 1.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer — height matches ReviseTocPanel footer (p-3 + default button = 60px) */}
      <div className="shrink-0 border-t border-border-default/50 p-3 flex items-center justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-content-muted hover:text-content-secondary transition-colors"
        >
          Cancel
        </button>

        {error && (
          <p className="mr-auto text-sm text-status-error">{error}</p>
        )}

        {phase === 'toc' && (
          <Button disabled>
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            Generating…
          </Button>
        )}

        {phase === 'awaiting_approval' && (
          <>
            <Button
              variant="outline"
              onClick={() => setFeedbackOpen(true)}
            >
              Edit Table of Contents
            </Button>
            <Button
              onClick={() => bookId && handleGenerateChapter1(bookId)}
              className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
            >
              Generate Chapter 1 →
            </Button>
          </>
        )}

        {phase === 'starting' && (
          <Button disabled>
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            Generating Chapter 1…
          </Button>
        )}

        {phase === 'revising' && (
          <Button disabled>
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            Revising…
          </Button>
        )}

        {phase === 'done' && (
          <Button disabled>
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            Opening book…
          </Button>
        )}
      </div>
      </div>

      <ReviseTocPanel
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onSubmit={(feedback) => {
          setFeedbackOpen(false)
          if (bookId) handleRevise(bookId, feedback)
        }}
        submitting={phase === 'revising'}
      />
      </div>
    </div>
  )
}
