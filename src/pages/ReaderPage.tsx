import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@src/components/ui/button'
import { SelectionTooltip } from '@src/components/SelectionTooltip'
import { ChatPanel } from '@src/components/ChatPanel'
import { useTextSelection } from '@src/hooks/useTextSelection'
import { useAppDispatch, useAppSelector, setChapterPosition, selectFontSize } from '@src/store'

interface Book {
  id: string
  title: string
  chaptersRead: number
  totalChapters: number
}

const MOCK_CHAPTERS: Record<string, { title: string; content: string }[]> = {}

function getChapters(book: Book) {
  if (!MOCK_CHAPTERS[book.id]) {
    MOCK_CHAPTERS[book.id] = Array.from({ length: book.totalChapters }, (_, i) => ({
      title: `Chapter ${i + 1}`,
      content: generateContent(book.title, i + 1),
    }))
  }
  return MOCK_CHAPTERS[book.id]
}

function generateContent(bookTitle: string, chapter: number): string {
  if (chapter === 1) {
    return `Welcome to **${bookTitle}**. This chapter lays the groundwork for everything that follows. We'll start with the core concepts you need before diving deeper.\n\n## Why This Matters\n\nUnderstanding the fundamentals isn't just academic — it shapes how you approach every problem in this domain. The patterns you'll learn here appear again and again in real-world scenarios.\n\n## What You'll Learn\n\n- The foundational mental models that experts rely on\n- Key terminology and how concepts relate to each other\n- Common misconceptions and how to avoid them\n- A framework for thinking about more advanced topics\n\n## Getting Started\n\nBefore we begin, take a moment to consider what you already know about this subject. Your existing knowledge is a scaffold — we'll build on it, challenge it where needed, and fill in the gaps.\n\nThe best way to learn is actively. As you read, pause to ask yourself: *"How does this connect to what I already know?"* and *"Where might I apply this?"*\n\n> "The beginning is the most important part of the work." — Plato`
  }
  return `This is chapter ${chapter} of **${bookTitle}**.\n\n## Building on What You Know\n\nIn the previous chapter, we established the core concepts. Now we'll extend that foundation with more nuanced ideas and practical applications.\n\n## Key Concepts\n\nEach concept builds on the last. Take your time here — understanding these connections is more valuable than memorizing individual facts.\n\n### Concept A\n\nThis relates directly to what we covered earlier, but with an important twist that changes how you should think about the problem.\n\n### Concept B\n\nHere's where theory meets practice. This is the pattern you'll reach for most often in real work.\n\n## Practice\n\nTry working through these ideas on your own before moving to the next chapter. The effort of recall strengthens understanding far more than re-reading.`
}

function renderChapterContent(chapter: { title: string; content: string }) {
  return (
    <article className="mx-auto max-w-2xl px-8 pt-6 pb-24">
      <h1 className="text-3xl font-bold tracking-tight">{chapter.title}</h1>
      <div className="mt-8 space-y-4 leading-[1.8] text-content-secondary">
        {chapter.content.split('\n\n').map((block, i) => {
          if (block.startsWith('> ')) {
            return (
              <blockquote
                key={i}
                className="border-l-2 border-border-focus/40 pl-4 italic text-content-muted"
              >
                {block.slice(2)}
              </blockquote>
            )
          }
          if (block.startsWith('## ')) {
            return (
              <h2 key={i} className="mt-10 text-xl font-semibold text-content-primary">
                {block.slice(3)}
              </h2>
            )
          }
          if (block.startsWith('### ')) {
            return (
              <h3 key={i} className="mt-7 text-lg font-medium text-content-primary">
                {block.slice(4)}
              </h3>
            )
          }
          if (block.startsWith('- ')) {
            return (
              <ul key={i} className="list-disc space-y-1.5 pl-6">
                {block.split('\n').map((line, j) => (
                  <li key={j}>{renderInline(line.replace(/^- /, ''))}</li>
                ))}
              </ul>
            )
          }
          return <p key={i}>{renderInline(block)}</p>
        })}
      </div>
    </article>
  )
}

export function ReaderPage({ book, onBack }: { book: Book; onBack: () => void }) {
  const dispatch = useAppDispatch()
  const savedPosition = useAppSelector(s => s.readingProgress.positions[book.id])
  const initialChapter = savedPosition ?? (book.chaptersRead > 0 ? book.chaptersRead - 1 : 0)

  const fontSize = useAppSelector(selectFontSize)
  const chapters = getChapters(book)
  const chapterIndex = useAppSelector(s => s.readingProgress.positions[book.id]) ?? initialChapter
  const chapter = chapters[chapterIndex]
  const hasPrev = chapterIndex > 0
  const hasNext = chapterIndex < chapters.length - 1

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
    if (next >= 0 && next < chapters.length) {
      dispatch(setChapterPosition({ bookId: book.id, chapterIndex: next }))
      scrollRef.current?.scrollTo({ top: 0 })
    }
  }, [chapterIndex, chapters.length, dispatch, book.id])

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
            {chapterIndex + 1} / {chapters.length}
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
              {renderChapterContent(chapter)}
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
          chapterContent={chapter.content}
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

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-content-primary">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return part
  })
}
