import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import { SafeMarkdown } from '@src/components/SafeMarkdown'
import { useAppSelector, selectHasApiKey, selectFunctionModel, selectFontSize, selectQuizLength } from '@src/store'
import { useStreamingContent } from '@src/hooks/useStreamingContent'
import { parseSSEStream } from '@src/lib/parse-sse-stream'
import { apiUrl } from '@src/lib/api-base'

type Phase = 'toc' | 'chapter' | 'done' | 'error'

interface CreationViewProps {
  topic: string
  details: string
  chapterCount: number
  onComplete: (bookId: string) => void
  onCancel: () => void
  onBookCreated?: (bookId: string, title: string, totalChapters?: number) => void
}

export function CreationView({ topic, details, chapterCount, onComplete, onCancel, onBookCreated }: CreationViewProps) {
  const hasApiKey = useAppSelector(selectHasApiKey)
  const { provider, model } = useAppSelector(selectFunctionModel('generation'))
  const { provider: quizProvider, model: quizModel } = useAppSelector(selectFunctionModel('quiz'))
  const quizLength = useAppSelector(selectQuizLength)
  const fontSize = useAppSelector(selectFontSize)

  const [phase, setPhase] = useState<Phase>('toc')
  const [activeTab, setActiveTab] = useState<'toc' | 'chapter'>('toc')
  const [bookId, setBookId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tocScrollRef = useRef<HTMLDivElement>(null)
  const chapterScrollRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  const toc = useStreamingContent()
  const chapter = useStreamingContent()

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
        throw new Error(`Request failed: ${res.status}`)
      }

      await parseSSEStream(res, {
        onEvent: (event) => {
          switch (event.type) {
            case 'toc':
              toc.appendChunk(event.text)
              // Auto-scroll TOC
              requestAnimationFrame(() => {
                tocScrollRef.current?.scrollTo({ top: tocScrollRef.current!.scrollHeight })
              })
              break

            case 'toc_done':
              toc.flushNow()
              setBookId(event.bookId)
              setPhase('chapter')
              setActiveTab('chapter')
              onBookCreated?.(event.bookId, event.title, event.totalChapters)
              break

            case 'chapter':
              chapter.appendChunk(event.text)
              // Auto-scroll chapter
              requestAnimationFrame(() => {
                chapterScrollRef.current?.scrollTo({ top: chapterScrollRef.current!.scrollHeight })
              })
              break

            case 'done':
              chapter.flushNow()
              setPhase('done')
              if (event.bookId) setBookId(event.bookId)
              break

            case 'error':
              setError(event.message)
              setPhase('error')
              break
          }
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setPhase('error')
    }
  }, [hasApiKey, model, provider, quizModel, quizProvider, quizLength, chapterCount, topic, details, toc, chapter, onBookCreated])

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true
      startGeneration()
    }
  }, [startGeneration])

  const isGenerating = phase === 'toc' || phase === 'chapter'

  return (
    <div className="flex h-screen flex-col text-content-primary">
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
          onClick={() => setActiveTab('chapter')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'chapter'
              ? 'text-content-primary'
              : 'text-content-muted hover:text-content-secondary'
          }`}
        >
          Chapter 1
          {activeTab === 'chapter' && (
            <span className="absolute bottom-0 inset-x-2 h-0.5 rounded-full bg-[oklch(0.55_0.20_285)]" />
          )}
          {phase === 'chapter' && (
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
            ) : phase === 'toc' ? (
              <p className="text-sm text-content-muted">
                Waiting for table of contents to finish...
              </p>
            ) : (
              <div className="flex items-center gap-2 text-content-muted">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Generating chapter 1...</span>
              </div>
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

        <Button
          size="lg"
          disabled={isGenerating}
          onClick={() => bookId && onComplete(bookId)}
          className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              Generating...
            </>
          ) : (
            'Start Book'
          )}
        </Button>
      </div>
    </div>
  )
}
