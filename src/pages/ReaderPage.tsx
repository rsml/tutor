import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@src/components/ui/button'
import { SelectionTooltip } from '@src/components/SelectionTooltip'
import { ChatPanel } from '@src/components/ChatPanel'
import { SettingsMenu } from '@src/components/SettingsMenu'
import { useTextSelection } from '@src/hooks/useTextSelection'
import { useAppDispatch, useAppSelector, setChapterPosition, selectFontSize, selectApiKey, selectModel, selectActiveProvider } from '@src/store'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { QuizPanel } from '@src/components/QuizPanel'
import { FeedbackForm } from '@src/components/FeedbackForm'

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

  type Phase = 'reading' | 'quiz' | 'feedback' | 'generating'
  const [phase, setPhase] = useState<Phase>('reading')
  const [generatedUpTo, setGeneratedUpTo] = useState(book.totalChapters)
  const [quizQuestions, setQuizQuestions] = useState<Array<{ question: string; options: string[]; correctIndex: number }>>([])
  const [quizAnswers, setQuizAnswers] = useState<number[]>([])
  const [streamingContent, setStreamingContent] = useState('')

  const apiKey = useAppSelector(selectApiKey)
  const model = useAppSelector(selectModel)
  const provider = useAppSelector(selectActiveProvider)

  const isOnLastGenerated = chapterIndex + 1 === generatedUpTo && generatedUpTo < book.totalChapters

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

  useEffect(() => {
    fetch(`http://localhost:3147/api/books/${book.id}`)
      .then(res => res.json())
      .then(data => setGeneratedUpTo(data.generatedUpTo))
      .catch(() => {})
  }, [book.id])

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

  const handleKeepGoing = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:3147/api/books/${book.id}/chapters/${chapterIndex + 1}/quiz`)
      if (res.ok) {
        const data = await res.json()
        if (data.questions?.length > 0) {
          setQuizQuestions(data.questions)
          setPhase('quiz')
          scrollRef.current?.scrollTo({ top: 0 })
          return
        }
      }
    } catch {}
    setPhase('feedback')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [book.id, chapterIndex])

  const handleQuizComplete = useCallback((answers: number[]) => {
    setQuizAnswers(answers)
    setPhase('feedback')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [])

  const handleQuizSkip = useCallback(() => {
    setQuizAnswers([])
    setPhase('feedback')
    scrollRef.current?.scrollTo({ top: 0 })
  }, [])

  const handleFeedbackSubmit = useCallback(async (liked: string, disliked: string) => {
    try {
      await fetch(`http://localhost:3147/api/books/${book.id}/chapters/${chapterIndex + 1}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked, disliked, quizAnswers }),
      })
    } catch {}

    setPhase('generating')
    setStreamingContent('')
    scrollRef.current?.scrollTo({ top: 0 })

    try {
      const res = await fetch(`http://localhost:3147/api/books/${book.id}/generate-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, model, provider }),
      })

      if (!res.ok || !res.body) throw new Error('Generation failed')

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
            if (data.type === 'chapter') {
              setStreamingContent(prev => prev + data.text)
            } else if (data.type === 'done') {
              const nextIndex = chapterIndex + 1
              setGeneratedUpTo(data.chapterNum)
              dispatch(setChapterPosition({ bookId: book.id, chapterIndex: nextIndex }))
              setPhase('reading')
              scrollRef.current?.scrollTo({ top: 0 })
            } else if (data.type === 'error') {
              setPhase('reading')
            }
          } catch {}
        }
      }
    } catch {
      setPhase('reading')
    }
  }, [book.id, chapterIndex, quizAnswers, apiKey, model, provider, dispatch])

  // Page turn
  const goChapter = useCallback((delta: number) => {
    const next = chapterIndex + delta
    if (next >= 0 && next < book.totalChapters) {
      dispatch(setChapterPosition({ bookId: book.id, chapterIndex: next }))
      setPhase('reading')
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
              {phase === 'reading' && (
                <div className="mx-auto max-w-2xl px-8 pt-6 pb-24">
                  {chapterLoading ? (
                    <div className="flex items-center gap-2 pt-12 text-content-muted">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">Loading chapter...</span>
                    </div>
                  ) : chapterContent ? (
                    <>
                      <div className="prose prose-neutral dark:prose-invert max-w-none leading-[1.8] text-content-secondary">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{chapterContent}</ReactMarkdown>
                      </div>
                      {isOnLastGenerated && (
                        <div className="mt-12 flex justify-center">
                          <Button
                            size="lg"
                            onClick={handleKeepGoing}
                            className="bg-[oklch(0.55_0.20_285)] text-white font-semibold hover:bg-[oklch(0.50_0.22_285)]"
                          >
                            Keep Going
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="pt-12 text-sm text-content-muted">
                      Chapter {chapterIndex + 1} hasn't been generated yet.
                    </p>
                  )}
                </div>
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
                />
              )}

              {phase === 'generating' && (
                <div className="mx-auto max-w-2xl px-8 pt-6 pb-24">
                  {streamingContent ? (
                    <div className="prose prose-neutral dark:prose-invert max-w-none leading-[1.8] text-content-secondary">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-12 text-content-muted">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">Generating chapter {chapterIndex + 2}...</span>
                    </div>
                  )}
                </div>
              )}
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

