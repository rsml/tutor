import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import { getBook, getToc, streamGenerationResume } from '@client/api'
import type { useStreamingContent } from '@client/hooks/useStreamingContent'
import type { Phase } from '@client/features/reader/ReaderPage'

export interface TocChapterSummary {
  title: string
  description: string
}

export interface UseGenerationResumeOptions {
  bookId: string
  streaming: ReturnType<typeof useStreamingContent>
  setGeneratedUpTo: Dispatch<SetStateAction<number>>
  setGeneratingChapterNum: Dispatch<SetStateAction<number | null>>
  setPhase: Dispatch<SetStateAction<Phase>>
  setGenerationStage: Dispatch<SetStateAction<string | null>>
  setGenerationError: Dispatch<SetStateAction<string | null>>
  setTocChapters: Dispatch<SetStateAction<TocChapterSummary[]>>
  setReadingPosition: (chapter: number, section?: number) => void
  bufferBoundaryRef: MutableRefObject<number>
  userHasScrolledRef: MutableRefObject<boolean>
  scrollRef: RefObject<HTMLElement | null>
  /**
   * Called when a generation failed specifically because the provider
   * rejected the credentials. The reader opens its existing missing-key
   * dialog, which is actionable, instead of leaving the user with a generic
   * error they have no way to resolve from the reader.
   */
  onAuthFailure?: () => void
}

/**
 * Runs once per book on mount. Fetches the book's metadata and, if a chapter
 * generation is already running server-side (started before this page
 * mounted, e.g. in another window or by the MCP server), reattaches to its
 * SSE stream instead of waiting for the reader to start one. Concurrently
 * fetches the table of contents.
 *
 * Non-obvious constraint: the resume stream can answer with `buffered`
 * chapter events, meaning everything generated before this reconnect. That
 * content is flushed to the screen immediately rather than growing chunk by
 * chunk, so `userHasScrolledRef` is forced true the moment a buffered event
 * arrives — otherwise useReaderScroll's autoscroll effect would see a huge
 * jump in content on the very first frame and yank the scroll position
 * around. `bufferBoundaryRef` records where the buffered content ends for
 * the same reason.
 *
 * The book and TOC requests guard their state updates with a plain
 * `cancelled` flag rather than an AbortController, since `getBook`/`getToc`
 * take no signal. The resume stream itself is aborted for real, since it is
 * a long-lived connection and `streamGenerationResume` accepts a signal for
 * exactly that. Both guards exist because React StrictMode double-invokes
 * this effect in development, which would otherwise reattach twice.
 */
export function useGenerationResume({
  bookId,
  streaming,
  setGeneratedUpTo,
  setGeneratingChapterNum,
  setPhase,
  setGenerationStage,
  setGenerationError,
  setTocChapters,
  setReadingPosition,
  bufferBoundaryRef,
  userHasScrolledRef,
  scrollRef,
  onAuthFailure,
}: UseGenerationResumeOptions): void {
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    getBook(bookId)
      .then(async (data) => {
        if (cancelled) return
        setGeneratedUpTo(data.generatedUpTo)

        // Check merged generation status
        if (data.generation.active) {
          const gen = data.generation
          if (gen.stage === 'done') return

          // A generation that already failed before this reader mounted,
          // including one the server marked interrupted when it restarted
          // mid-chapter. Previously this returned silently, which left the
          // reader sitting in whatever phase it had, showing nothing and
          // offering no way forward, even though the retry affordance for
          // exactly this case already existed one phase away.
          if (gen.stage === 'error') {
            setGenerationStage(null)
            setGenerationError(gen.error ?? 'Generation was interrupted.')
            setPhase('generation-error')
            if (gen.errorKind === 'auth-failed') onAuthFailure?.()
            return
          }

          // Active generation — set phase immediately and connect to stream
          setGeneratingChapterNum(gen.chapterNum)
          setPhase('generating')
          streaming.reset()
          setGenerationStage(null)
          bufferBoundaryRef.current = 0

          await streamGenerationResume(bookId, controller.signal, (event) => {
            if (event.type === 'chapter') {
              if (event.buffered) {
                // Buffered content from reconnect: render immediately, disable auto-scroll
                streaming.appendChunk(event.text)
                streaming.flushNow()
                bufferBoundaryRef.current = streaming.bufferRef.current.length
                userHasScrolledRef.current = true
              } else {
                streaming.appendChunk(event.text)
              }
            } else if (event.type === 'stage') {
              setGenerationStage(event.stage)
            } else if (event.type === 'done' && event.chapterNum != null) {
              streaming.flushNow()
              setGenerationStage(null)
              setGeneratedUpTo(event.chapterNum)
              setGeneratingChapterNum(null)
              setReadingPosition(event.chapterNum - 1, 0)
              setPhase('reading')
              scrollRef.current?.scrollTo({ top: 0 })
            } else if (event.type === 'error') {
              setGenerationStage(null)
              setGenerationError(event.message)
              setPhase('generation-error')
              if (event.kind === 'auth-failed') onAuthFailure?.()
            }
          })
        }
      })
      .catch(() => {})

    getToc(bookId)
      .then((data) => {
        if (cancelled) return
        setTocChapters(data.chapters.map(c => ({ title: c.title, description: c.description ?? '' })))
      })
      .catch(() => {})

    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per book id, same as before extraction
  }, [bookId])
}
