import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { SafeMarkdown } from '@src/components/SafeMarkdown'
import { ReviseTocPanel } from '@src/components/ReviseTocPanel'
import { useAppSelector, selectHasApiKey, selectFunctionModel, selectFontSize, selectQuizLength } from '@src/store'
import { useStreamingContent } from '@src/hooks/useStreamingContent'
import { parseSSEStream } from '@src/lib/parse-sse-stream'
import { apiUrl } from '@src/lib/api-base'
import { formatTocAsMarkdown } from '@src/lib/format-toc'
import { toast } from '@src/lib/toast'

type Phase = 'toc' | 'awaiting_approval' | 'revising' | 'starting' | 'done' | 'error'

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

  const hasApiKey = useAppSelector(selectHasApiKey)
  const { provider, model } = useAppSelector(selectFunctionModel('generation'))
  const { provider: quizProvider, model: quizModel } = useAppSelector(selectFunctionModel('quiz'))
  const quizLength = useAppSelector(selectQuizLength)
  const fontSize = useAppSelector(selectFontSize)

  const [phase, setPhase] = useState<Phase>('toc')
  const [activeTab, setActiveTab] = useState<'toc' | 'chapter'>('toc')
  const [bookId, setBookId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const tocScrollRef = useRef<HTMLDivElement>(null)
  const chapterScrollRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  const toc = useStreamingContent()
  const chapter = useStreamingContent()

  const handleGenerateChapter1 = useCallback(async (id: string) => {
    setPhase('starting')
    setActiveTab('chapter')
    try {
      const res = await fetch(apiUrl(`/api/books/${id}/start`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, provider, quizModel, quizProvider, quizLength }),
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message || `Start failed: ${res.status}`)
      }
      await parseSSEStream(res, {
        onEvent: (event) => {
          switch (event.type) {
            case 'chapter':
              chapter.appendChunk(event.text)
              requestAnimationFrame(() => {
                chapterScrollRef.current?.scrollTo({ top: chapterScrollRef.current!.scrollHeight })
              })
              break
            case 'done':
              chapter.flushNow()
              setPhase('done')
              break
            case 'error':
              setError('Generation failed: ' + event.message)
              setPhase('error')
              break
          }
        },
      })
    } catch (err) {
      setError('Generation failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
      setPhase('error')
    }
  }, [model, provider, quizModel, quizProvider, quizLength, chapter])

  const handleRevise = useCallback(async (id: string, feedback: string) => {
    setPhase('revising')
    setActiveTab('toc')
    // Clear the existing TOC content to make room for the streamed replacement
    toc.flushNow()
    toc.reset()
    try {
      const res = await fetch(apiUrl(`/api/books/${id}/toc/revise`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback, model, provider }),
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message || `Revise failed: ${res.status}`)
      }
      await parseSSEStream(res, {
        onEvent: (event) => {
          switch (event.type) {
            case 'toc':
              toc.appendChunk(event.text)
              requestAnimationFrame(() => {
                tocScrollRef.current?.scrollTo({ top: tocScrollRef.current!.scrollHeight })
              })
              break
            case 'toc_revised':
              toc.flushNow()
              setPhase('awaiting_approval')
              break
            case 'error':
              toast.error('Revise failed: ' + event.message)
              setPhase('awaiting_approval')
              break
          }
        },
      })
    } catch (err) {
      toast.error('Revise failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
      setPhase('awaiting_approval')
    }
  }, [model, provider, toc])

  const startGeneration = useCallback(async () => {
    if (!hasApiKey) {
      setError('Please set your API key in Settings first.')
      setPhase('error')
      return
    }

    try {
      const res = await fetch(apiUrl('/api/books'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, details, model, provider, quizModel, quizProvider, quizLength, chapterCount }),
      })

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message || `Request failed: ${res.status}`)
      }

      await parseSSEStream(res, {
        onEvent: (event) => {
          switch (event.type) {
            case 'book_created':
              setBookId(event.bookId)
              onBookCreated?.(event.bookId, event.title, event.totalChapters)
              break

            case 'toc':
              toc.appendChunk(event.text)
              // Auto-scroll TOC
              requestAnimationFrame(() => {
                tocScrollRef.current?.scrollTo({ top: tocScrollRef.current!.scrollHeight })
              })
              break

            case 'toc_done': {
              toc.flushNow()
              setBookId(event.bookId)
              setPhase('awaiting_approval')
              // No automatic startChapterGeneration anymore.
              break
            }

            case 'done':
              // POST /api/books now ends after toc_done; this just closes the stream
              break

            case 'error':
              setError('Generation failed: ' + event.message)
              setPhase('error')
              break
          }
        },
      })
    } catch (err) {
      setError('Generation failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
      setPhase('error')
    }
  }, [hasApiKey, model, provider, quizModel, quizProvider, quizLength, chapterCount, topic, details, toc, onBookCreated])

  const resumeFromExisting = useCallback(async (id: string) => {
    try {
      const [bookRes, tocRes] = await Promise.all([
        fetch(apiUrl(`/api/books/${id}`)),
        fetch(apiUrl(`/api/books/${id}/toc`)),
      ])
      if (!bookRes.ok || !tocRes.ok) throw new Error('Failed to load book')
      const book = await bookRes.json()
      const tocData = await tocRes.json()

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
    <div className="flex h-screen text-content-primary">
    <div className="flex h-screen flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header
        className="relative flex h-12 shrink-0 items-center border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          Creating Book
        </span>
      </header>

      {/* Tabs */}
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

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        {/* Back button — overlays top-left of content area */}
        <button
          onClick={onCancel}
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

      {/* Footer */}
      <div className="shrink-0 border-t border-border-default/50 p-4 flex items-center justify-end gap-3">
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
          <Button size="lg" disabled>
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            Generating…
          </Button>
        )}

        {phase === 'awaiting_approval' && (
          <>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setFeedbackOpen(true)}
            >
              Provide Feedback
            </Button>
            <Button
              size="lg"
              onClick={() => bookId && handleGenerateChapter1(bookId)}
              className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
            >
              Generate Chapter 1 →
            </Button>
          </>
        )}

        {phase === 'starting' && (
          <Button size="lg" disabled>
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            Generating Chapter 1…
          </Button>
        )}

        {phase === 'revising' && (
          <Button size="lg" disabled>
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            Revising…
          </Button>
        )}

        {phase === 'done' && (
          <Button
            size="lg"
            onClick={() => bookId && onComplete(bookId)}
            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
          >
            Start Book
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
  )
}
