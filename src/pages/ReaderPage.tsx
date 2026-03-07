import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@src/components/ui/button'
import { SelectionTooltip } from '@src/components/SelectionTooltip'
import { ChatPanel } from '@src/components/ChatPanel'
import { SettingsMenu } from '@src/components/SettingsMenu'
import { useTextSelection } from '@src/hooks/useTextSelection'
import { useAppDispatch, useAppSelector, setChapterPosition, selectFontSize } from '@src/store'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Book {
  id: string
  title: string
  chaptersRead: number
  totalChapters: number
}

export function ReaderPage({ book, onBack }: { book: Book; onBack: () => void }) {
  const dispatch = useAppDispatch()
  const savedPosition = useAppSelector(s => s.readingProgress.positions[book.id])
  const initialChapter = savedPosition ?? (book.chaptersRead > 0 ? book.chaptersRead - 1 : 0)

  const fontSize = useAppSelector(selectFontSize)
  const chapterIndex = useAppSelector(s => s.readingProgress.positions[book.id]) ?? initialChapter
  const hasPrev = chapterIndex > 0
  const hasNext = chapterIndex < book.totalChapters - 1

  // Fetch chapter content from API
  const [chapterContent, setChapterContent] = useState<string | null>(null)
  const [chapterLoading, setChapterLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setChapterLoading(true)
    setChapterContent(null)

    const chapterNum = chapterIndex + 1
    fetch(`http://localhost:3147/api/books/${book.id}/chapters/${chapterNum}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found')
        return res.json()
      })
      .then(data => {
        if (!cancelled) {
          setChapterContent(data.content)
          setChapterLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChapterContent(null)
          setChapterLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [book.id, chapterIndex])

  const scrollRef = useRef<HTMLElement>(null)
  const articleRef = useRef<HTMLElement>(null)

  // Text selection
  const { selectedText, selectionRect, clearSelection } = useTextSelection(articleRef)

  // Chat panel
  const [chatOpen, setChatOpen] = useState(false)
  const [chatSelectedText, setChatSelectedText] = useState('')
  const [chatPrompt, setChatPrompt] = useState<string | null>(null)
  const [missingKeyAlert, setMissingKeyAlert] = useState(false)

  const handleSelectionAction = useCallback((prompt: string) => {
    setChatSelectedText(selectedText)
    setChatPrompt(prompt)
    setChatOpen(true)
    clearSelection()
  }, [selectedText, clearSelection])

  const handleCloseChat = useCallback(() => {
    setChatOpen(false)
    setChatPrompt(null)
  }, [])

  // Page turn
  const goChapter = useCallback((delta: number) => {
    const next = chapterIndex + delta
    if (next >= 0 && next < book.totalChapters) {
      dispatch(setChapterPosition({ bookId: book.id, chapterIndex: next }))
      scrollRef.current?.scrollTo({ top: 0 })
    }
  }, [chapterIndex, book.totalChapters, dispatch, book.id])

  // Save initial position on mount
  useEffect(() => {
    if (savedPosition == null) {
      dispatch(setChapterPosition({ bookId: book.id, chapterIndex: initialChapter }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen flex-col text-content-primary">
      {/* Header — drag region */}
      <header
        className="relative z-30 flex h-12 shrink-0 items-center border-b border-border-default/50 bg-surface-base/90 px-4 backdrop-blur-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="absolute inset-x-0 pointer-events-none text-center text-sm font-semibold tracking-tight">
          {book.title}
        </span>

        {/* Chapter nav */}
        <div
          className="ml-auto flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="mr-1 text-xs text-content-muted">
            {chapterIndex + 1} / {book.totalChapters}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => goChapter(-1)}
            disabled={!hasPrev}
            aria-label="Previous chapter"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => goChapter(1)}
            disabled={!hasNext}
            aria-label="Next chapter"
          >
            <ChevronRight className="size-4" />
          </Button>
          <SettingsMenu subtle />
        </div>
      </header>

      {/* Back button — below header, larger, translucent */}
      <div className="shrink-0 px-6 pt-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-content-muted/50 transition-colors hover:text-content-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
      </div>

      {/* Content + chat panel in horizontal flex */}
      <div className="flex flex-1 overflow-hidden">
        {/* Content area with edge tap zones */}
        <div className="relative flex-1 overflow-hidden">
          {/* Left tap zone — previous chapter */}
          {hasPrev && (
            <div
              className="absolute left-0 top-0 bottom-0 z-10 flex w-16 cursor-pointer items-center justify-center opacity-0 transition-opacity hover:opacity-100"
              onClick={() => goChapter(-1)}
            >
              <div className="rounded-full bg-surface-muted/60 p-2 backdrop-blur-sm">
                <ChevronLeft className="size-5 text-content-muted" />
              </div>
            </div>
          )}

          {/* Right tap zone — next chapter */}
          {hasNext && (
            <div
              className="absolute right-0 top-0 bottom-0 z-10 flex w-16 cursor-pointer items-center justify-center opacity-0 transition-opacity hover:opacity-100"
              onClick={() => goChapter(1)}
            >
              <div className="rounded-full bg-surface-muted/60 p-2 backdrop-blur-sm">
                <ChevronRight className="size-5 text-content-muted" />
              </div>
            </div>
          )}

          {/* Scrollable chapter content */}
          <main
            ref={scrollRef}
            className="h-full overflow-y-auto"
          >
            <article ref={articleRef} style={{ fontSize: `${fontSize}px` }}>
              <div className="mx-auto max-w-2xl px-8 pt-6 pb-24">
                {chapterLoading ? (
                  <div className="flex items-center gap-2 pt-12 text-content-muted">
                    <Loader2 className="size-4 animate-spin" />
                    <span className="text-sm">Loading chapter...</span>
                  </div>
                ) : chapterContent ? (
                  <div className="prose prose-neutral dark:prose-invert max-w-none leading-[1.8] text-content-secondary">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{chapterContent}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="pt-12 text-sm text-content-muted">
                    Chapter {chapterIndex + 1} hasn't been generated yet.
                  </p>
                )}
              </div>
            </article>
          </main>

          {/* Selection tooltip */}
          <SelectionTooltip
            selectedText={selectedText}
            selectionRect={selectionRect}
            onAction={handleSelectionAction}
          />
        </div>

        {/* Chat panel — sibling, pushes content */}
        <ChatPanel
          open={chatOpen}
          onClose={handleCloseChat}
          selectedText={chatSelectedText}
          chapterContent={chapterContent ?? ''}
          initialPrompt={chatPrompt}
          onMissingApiKey={() => setMissingKeyAlert(true)}
        />
      </div>

      {/* Missing API key nudge */}
      {missingKeyAlert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-xs"
          onClick={() => setMissingKeyAlert(false)}
        >
          <div className="rounded-xl border border-border-default bg-surface-overlay p-6 shadow-lg" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-content-primary">Set your API key in Settings to use chat features.</p>
            <button
              onClick={() => setMissingKeyAlert(false)}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

