import type { GenerationStage, GenerationStatus } from '@shared/responses.js'
import type { GenerateChapterEvent } from '@shared/events.js'
import type { BookRepository } from '../ports/book-repository.js'
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
}

export interface GenerationOptions extends GenerateNextChapterOptions {
  /** Set for regeneration — generate this exact chapter instead of generatedUpTo + 1. */
  targetChapterNum?: number
}

export interface ChapterGenerationStream {
  isGenerating(bookId: string): boolean
  getStatus(bookId: string): GenerationStatus
  /** Returns an unsubscribe function. sendBuffered replays already-streamed content as one buffered chapter event on join. */
  subscribe(bookId: string, callback: Subscriber, sendBuffered: boolean): () => void
  startGeneration(bookId: string, options: GenerationOptions): void
}

export function createChapterGenerationStream(deps: {
  books: BookRepository
  generateNextChapter: GenerateNextChapter
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
    try {
      const meta = await deps.books.getBook(bookId)
      const nextNum = options.targetChapterNum ?? meta.generatedUpTo + 1
      state.chapterNum = nextNum

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
      emit(state, { type: 'error', message: state.error })
      scheduleCleanup(bookId, state)
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
      return { active: true, chapterNum: state.chapterNum, stage: state.stage, contentLength: state.content.length }
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
        callback({ type: 'error', message: state.error })
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
  }
}
