import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAppSelector, selectApiKey, selectModel, selectActiveProvider, selectFontSize } from '@src/store'

type Phase = 'toc' | 'chapter' | 'done' | 'error'

interface CreationViewProps {
  topic: string
  details: string
  onComplete: (bookId: string) => void
  onCancel: () => void
}

export function CreationView({ topic, details, onComplete, onCancel }: CreationViewProps) {
  const apiKey = useAppSelector(selectApiKey)
  const model = useAppSelector(selectModel)
  const provider = useAppSelector(selectActiveProvider)
  const fontSize = useAppSelector(selectFontSize)

  const [phase, setPhase] = useState<Phase>('toc')
  const [tocContent, setTocContent] = useState('')
  const [chapterContent, setChapterContent] = useState('')
  const [activeTab, setActiveTab] = useState<'toc' | 'chapter'>('toc')
  const [bookId, setBookId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tocScrollRef = useRef<HTMLDivElement>(null)
  const chapterScrollRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  const startGeneration = useCallback(async () => {
    if (!apiKey) {
      setError('Please set your API key in Settings first.')
      setPhase('error')
      return
    }

    try {
      const res = await fetch('http://localhost:3147/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, details, apiKey, model, provider }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`)
      }

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

            switch (data.type) {
              case 'toc':
                setTocContent(prev => prev + data.text)
                requestAnimationFrame(() => {
                  tocScrollRef.current?.scrollTo({ top: tocScrollRef.current!.scrollHeight })
                })
                break

              case 'toc_done':
                setBookId(data.bookId)
                setPhase('chapter')
                setActiveTab('chapter')
                break

              case 'chapter':
                setChapterContent(prev => prev + data.text)
                requestAnimationFrame(() => {
                  chapterScrollRef.current?.scrollTo({ top: chapterScrollRef.current!.scrollHeight })
                })
                break

              case 'done':
                setPhase('done')
                if (data.bookId) setBookId(data.bookId)
                break

              case 'error':
                setError(data.message)
                setPhase('error')
                break
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setPhase('error')
    }
  }, [apiKey, model, provider, topic, details])

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
        {/* TOC page */}
        <div
          ref={tocScrollRef}
          className={`absolute inset-0 overflow-y-auto transition-opacity duration-200 ${
            activeTab === 'toc' ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="mx-auto max-w-2xl px-8 py-8">
            {tocContent ? (
              <div className="creation-markdown" style={{ fontSize: `${fontSize}px` }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{tocContent}</ReactMarkdown>
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
            {chapterContent ? (
              <div className="creation-markdown" style={{ fontSize: `${fontSize}px` }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{chapterContent}</ReactMarkdown>
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
