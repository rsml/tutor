import type { AiErrorKind, GenerationStage, GenerationStatus } from '@shared/responses.js'
import type { GenerateChapterEvent } from '@shared/events.js'
import type { GenerationJobParams } from '@shared/domain.js'
import type { ProviderId } from '@shared/provider.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { JobJournal } from '../ports/job-journal.js'
import type { Clock } from '../ports/clock.js'
import { TextGenerationError } from '../ports/text-generation.js'
import { GENERATION_STREAM_CLEANUP_MS } from '../constants.js'
import type { GenerateNextChapter, GenerateNextChapterOptions } from './generate-next-chapter.js'

/**
 * The in-memory hub behind the single-chapter SSE flow: POST
 * /api/books/:id/generate-next, POST /api/books/:id/chapters/:num/regenerate,
 * GET /api/books/:id/generation-status, and GET /api/books/:id/generation-stream
 * (reconnect) in server/routes/generation.ts all read or drive this same
 * per-book state through one shared instance.
 *
 * It owns only orchestration — which chapter number to generate next, the
 * stage/content/subscriber bookkeeping, and cleanup after the last
 * subscriber leaves a finished generation. The actual chapter text, quiz,
 * and persistence are GenerateNextChapter's job (see generate-next-chapter.ts);
 * this hub calls that function once per startGeneration() and turns its
 * onChunk callback and settlement into the SSE event stream a route
 * forwards verbatim.
 */

type Subscriber = (event: GenerateChapterEvent) => void

interface GenerationState {
  content: string
  stage: GenerationStage
  chapterNum: number
  subscribers: Set<Subscriber>
  promise: Promise<void>
  cleanupTimer?: ReturnType<typeof setTimeout>
  doneData?: { chapterNum: number }
  error?: string
  errorKind?: AiErrorKind
}

interface GenerationOptions extends GenerateNextChapterOptions {
  /** Set for regeneration — generate this exact chapter instead of generatedUpTo + 1. */
  targetChapterNum?: number
}

export interface ChapterGenerationStream {
  isGenerating(bookId: string): boolean
  getStatus(bookId: string): GenerationStatus
  /** Returns an unsubscribe function. sendBuffered replays already-streamed content as one buffered chapter event on join. */
  subscribe(bookId: string, callback: Subscriber, sendBuffered: boolean): () => void
  startGeneration(bookId: string, options: GenerationOptions): void
  /**
   * Seeds a terminal error state for a book at boot, for a generate-chapter
   * job that was still running when the process died. See the
   * implementation below for why this deliberately skips scheduleCleanup.
   */
  seedInterrupted(bookId: string, chapterNum: number, message: string): void
}

export function createChapterGenerationStream(deps: {
  books: BookRepository
  generateNextChapter: GenerateNextChapter
  /**
   * Both optional, and independently so, purely so the many existing tests
   * that construct this hub with only {books, generateNextChapter} keep
   * compiling unchanged. Journalling is additive observability the hub's
   * own generation flow does not need to function: a caller (or test) that
   * omits either simply gets a hub that never writes a generate-chapter
   * record to the job journal, and therefore never has one for
   * resume-interrupted-jobs.ts to find at the next boot.
   */
  journal?: JobJournal
  clock?: Clock
}): ChapterGenerationStream {
  const generationStates = new Map<string, GenerationState>()

  function emit(state: GenerationState, event: GenerateChapterEvent): void {
    for (const cb of state.subscribers) {
      try { cb(event) } catch { /* subscriber error */ }
    }
  }

  function scheduleCleanup(bookId: string, state: GenerationState): void {
    if (state.cleanupTimer) return
    state.cleanupTimer = setTimeout(() => {
      generationStates.delete(bookId)
    }, GENERATION_STREAM_CLEANUP_MS)
  }

  async function runGeneration(bookId: string, state: GenerationState, options: GenerationOptions): Promise<void> {
    // Journalled under a fresh id whenever a journal and clock were both
    // supplied, so a generation still in flight when the process dies can
    // be found by resume-interrupted-jobs.ts at the next boot. There is no
    // way to resume a partially streamed chapter with any provider, only to
    // surface that it was interrupted, which is exactly what that resume
    // pass does via seedInterrupted below. bookTitle needs the book, which
    // is not known synchronously in startGeneration, so the record is
    // written here, right after the getBook call this function already has
    // to make, rather than before runGeneration is even invoked. The record
    // and its clearing both live in this one function, in a try/finally, so
    // every exit path below (the "already generated" guard, a clean finish,
    // or a caught failure) leaves nothing behind once this promise settles.
    const jobId = deps.journal && deps.clock ? deps.clock.newId() : undefined

    try {
      const meta = await deps.books.getBook(bookId)
      const nextNum = options.targetChapterNum ?? meta.generatedUpTo + 1
      state.chapterNum = nextNum

      if (jobId && deps.journal && deps.clock) {
        const now = deps.clock.nowIso()
        // Only these three. Never an API key, this journal is written to
        // disk unencrypted and a key belongs in KeyVault alone.
        const params: GenerationJobParams = {
          ...(options.targetChapterNum !== undefined ? { targetChapterNum: options.targetChapterNum } : {}),
          ...(options.provider !== undefined ? { provider: options.provider as ProviderId } : {}),
          ...(options.model !== undefined ? { model: options.model } : {}),
        }
        deps.journal.record({
          id: jobId,
          type: 'generate-chapter',
          bookId,
          bookTitle: meta.title,
          status: 'running',
          checkpoint: { kind: 'none' },
          params,
          startedAt: now,
          updatedAt: now,
        })
      }

      if (nextNum > meta.totalChapters) {
        state.stage = 'error'
        state.error = 'All chapters already generated'
        emit(state, { type: 'error', message: state.error })
        scheduleCleanup(bookId, state)
        return
      }

      await deps.generateNextChapter(bookId, nextNum, options, (chunk) => {
        state.content += chunk
        emit(state, { type: 'chapter', text: chunk })
      })

      state.stage = 'done'
      state.doneData = { chapterNum: nextNum }
      emit(state, { type: 'done', chapterNum: nextNum })
      scheduleCleanup(bookId, state)
    } catch (error) {
      state.stage = 'error'
      state.error = error instanceof Error ? error.message : 'Generation failed'
      // Carry the failure class through to the client when the provider
      // gave us one. The reader uses it to tell an unusable API key apart
      // from a transient overload, so it can open the missing-key dialog
      // instead of a toast the user cannot act on. Anything that is not a
      // TextGenerationError, such as a parse failure this app raised
      // itself, has no class and simply omits the field.
      state.errorKind = error instanceof TextGenerationError ? error.kind : undefined
      emit(state, { type: 'error', message: state.error, ...(state.errorKind ? { kind: state.errorKind } : {}) })
      scheduleCleanup(bookId, state)
    } finally {
      if (jobId && deps.journal) deps.journal.clear(jobId)
    }
  }

  return {
    isGenerating(bookId) {
      const state = generationStates.get(bookId)
      return !!state && state.stage !== 'done' && state.stage !== 'error'
    },

    getStatus(bookId) {
      const state = generationStates.get(bookId)
      if (!state) return { active: false }
      return {
        active: true,
        chapterNum: state.chapterNum,
        stage: state.stage,
        contentLength: state.content.length,
        ...(state.error !== undefined ? { error: state.error } : {}),
        ...(state.errorKind !== undefined ? { errorKind: state.errorKind } : {}),
      }
    },

    subscribe(bookId, callback, sendBuffered) {
      const state = generationStates.get(bookId)
      if (!state) return () => {}

      // Reset cleanup timer on new subscriber
      if (state.cleanupTimer) {
        clearTimeout(state.cleanupTimer)
        state.cleanupTimer = undefined
      }

      // Send buffered content if requested
      if (sendBuffered && state.content.length > 0) {
        callback({ type: 'chapter', text: state.content, buffered: true })
      }

      // If already in terminal state, send terminal event immediately
      if (state.stage === 'done' && state.doneData) {
        callback({ type: 'done', chapterNum: state.doneData.chapterNum })
        scheduleCleanup(bookId, state)
        return () => {}
      }
      if (state.stage === 'error' && state.error) {
        callback({ type: 'error', message: state.error, ...(state.errorKind ? { kind: state.errorKind } : {}) })
        scheduleCleanup(bookId, state)
        return () => {}
      }

      state.subscribers.add(callback)

      return () => {
        state.subscribers.delete(callback)
        // If no more subscribers and in terminal state, schedule cleanup
        if (state.subscribers.size === 0 && (state.stage === 'done' || state.stage === 'error')) {
          scheduleCleanup(bookId, state)
        }
      }
    },

    startGeneration(bookId, options) {
      const state: GenerationState = {
        content: '',
        stage: 'streaming',
        chapterNum: 0,
        subscribers: new Set(),
        promise: Promise.resolve(),
      }

      generationStates.set(bookId, state)
      state.promise = runGeneration(bookId, state, options)
    },

    seedInterrupted(bookId, chapterNum, message) {
      // Deliberately does NOT call scheduleCleanup. Every other terminal
      // state above is scheduled for eviction after
      // GENERATION_STREAM_CLEANUP_MS (five minutes) because a live client is
      // already watching it by the time that state is reached, so a short
      // grace period after the last subscriber leaves is plenty. A state
      // seeded here at boot has no watcher yet, and the user may not open
      // this book's reader for hours, so an eviction timer would silently
      // discard the only record that this chapter's generation failed,
      // often before anyone ever saw it. Instead it is cleaned up the
      // ordinary way: the moment a subscriber does join, subscribe()'s
      // existing terminal-state branch above delivers the error event and
      // schedules cleanup itself, exactly as it does for a generation that
      // failed live.
      const state: GenerationState = {
        content: '',
        stage: 'error',
        chapterNum,
        subscribers: new Set(),
        promise: Promise.resolve(),
        error: message,
      }
      generationStates.set(bookId, state)
    },
  }
}
