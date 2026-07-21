import { describe, expect, it, vi } from 'vitest'
import type { BookMeta } from '@shared/domain.js'
import type { GenerateChapterEvent } from '@shared/events.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeJobJournal } from '../ports/job-journal.fake.js'
import { createFakeClock } from '../ports/clock.fake.js'
import { GENERATION_STREAM_CLEANUP_MS } from '../constants.js'
import { createChapterGenerationStream } from './chapter-generation-stream.js'
import type { GenerateNextChapterOptions } from './generate-next-chapter.js'

const BOOK: BookMeta = {
  id: 'book-1',
  title: 'Distributed Systems',
  prompt: 'Learn distributed systems',
  status: 'reading',
  totalChapters: 2,
  generatedUpTo: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  tags: [],
  audioGeneratedChapters: [],
}

/**
 * A controllable stand-in for GenerateNextChapter. The hub never inspects
 * the resolved return value (only the onChunk callback it is given), so
 * this stub's resolve()/reject() settle the call without emitting a chunk,
 * exactly like the buffered-content test needs to drive onChunk and
 * settlement as two separate, orderable steps.
 */
function makeStubGenerateNextChapter() {
  const calls: Array<{ bookId: string; chapterNum: number; options: GenerateNextChapterOptions }> = []
  let currentOnChunk: ((text: string) => void) | undefined
  let resolveCurrent: ((content: string) => void) | undefined
  let rejectCurrent: ((err: Error) => void) | undefined

  const fn = vi.fn(async (
    bookId: string,
    chapterNum: number,
    options: GenerateNextChapterOptions,
    onChunk?: (text: string) => void,
  ): Promise<string> => {
    calls.push({ bookId, chapterNum, options })
    currentOnChunk = onChunk
    return new Promise<string>((resolve, reject) => {
      resolveCurrent = resolve
      rejectCurrent = reject
    })
  })

  return {
    fn,
    calls,
    emitChunk: (text: string) => currentOnChunk?.(text),
    resolve: (content: string) => resolveCurrent!(content),
    reject: (err: Error) => rejectCurrent!(err),
  }
}

/** Collects every event a subscription receives, and resolves once a terminal one arrives. */
function collectUntilTerminal() {
  const events: GenerateChapterEvent[] = []
  let done!: (events: GenerateChapterEvent[]) => void
  const settled = new Promise<GenerateChapterEvent[]>((resolve) => { done = resolve })
  const callback = (event: GenerateChapterEvent) => {
    events.push(event)
    if (event.type === 'done' || event.type === 'error') done(events)
  }
  return { events, callback, settled }
}

describe('createChapterGenerationStream', () => {
  it('reports inactive for a book that was never started', () => {
    const books = createFakeBookRepository()
    const stream = createChapterGenerationStream({ books, generateNextChapter: makeStubGenerateNextChapter().fn })
    expect(stream.getStatus(BOOK.id)).toEqual({ active: false })
    expect(stream.isGenerating(BOOK.id)).toBe(false)
  })

  it('marks a book as generating immediately, synchronously, once started', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(BOOK)
    const stub = makeStubGenerateNextChapter()
    const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn })

    stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6' })

    expect(stream.isGenerating(BOOK.id)).toBe(true)
    expect(stream.getStatus(BOOK.id)).toMatchObject({ active: true, stage: 'streaming' })
  })

  it('generates generatedUpTo + 1 by default and emits chapter/done in order', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(BOOK)
    const stub = makeStubGenerateNextChapter()
    const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn })
    const { events, callback, settled } = collectUntilTerminal()

    stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6' })
    stream.subscribe(BOOK.id, callback, false)
    await vi.waitFor(() => expect(stub.fn).toHaveBeenCalled())
    stub.emitChunk('the chapter text')
    stub.resolve('the chapter text')

    await settled
    expect(events).toEqual([
      { type: 'chapter', text: 'the chapter text' },
      { type: 'done', chapterNum: 2 },
    ])
    expect(stub.calls[0]).toMatchObject({ bookId: BOOK.id, chapterNum: 2 })
    expect(stream.isGenerating(BOOK.id)).toBe(false)
  })

  it('generates the targetChapterNum instead, for regeneration', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(BOOK)
    const stub = makeStubGenerateNextChapter()
    const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn })
    const sub = collectUntilTerminal()

    stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6', targetChapterNum: 1 })
    stream.subscribe(BOOK.id, sub.callback, false)
    await vi.waitFor(() => expect(stub.fn).toHaveBeenCalled())
    stub.resolve('regenerated')

    await sub.settled
    expect(stub.calls[0]).toMatchObject({ chapterNum: 1 })
  })

  it('errors without calling generateNextChapter when every chapter is already generated', async () => {
    const books = createFakeBookRepository()
    await books.saveBook({ ...BOOK, generatedUpTo: 2, totalChapters: 2 })
    const stub = makeStubGenerateNextChapter()
    const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn })
    const { events, callback, settled } = collectUntilTerminal()

    stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6' })
    stream.subscribe(BOOK.id, callback, false)

    await settled
    expect(events).toEqual([{ type: 'error', message: 'All chapters already generated' }])
    expect(stub.fn).not.toHaveBeenCalled()
  })

  it('emits an error event when generateNextChapter rejects', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(BOOK)
    const stub = makeStubGenerateNextChapter()
    const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn })
    const { events, callback, settled } = collectUntilTerminal()

    stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6' })
    stream.subscribe(BOOK.id, callback, false)
    await vi.waitFor(() => expect(stub.fn).toHaveBeenCalled())
    stub.reject(new Error('model exploded'))

    await settled
    expect(events).toEqual([{ type: 'error', message: 'model exploded' }])
    expect(stream.getStatus(BOOK.id)).toMatchObject({ active: true, stage: 'error' })
  })

  it('replays already-streamed content as one buffered chunk to a subscriber that joins mid-stream', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(BOOK)
    const stub = makeStubGenerateNextChapter()
    const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn })

    stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6' })
    await vi.waitFor(() => expect(stub.fn).toHaveBeenCalled())
    stub.emitChunk('partial ')
    stub.emitChunk('progress')

    const late: GenerateChapterEvent[] = []
    stream.subscribe(BOOK.id, (e) => late.push(e), true)

    expect(late).toEqual([{ type: 'chapter', text: 'partial progress', buffered: true }])
  })

  it('immediately replays the done event to a subscriber that joins after completion', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(BOOK)
    const stub = makeStubGenerateNextChapter()
    const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn })
    const first = collectUntilTerminal()
    stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6' })
    stream.subscribe(BOOK.id, first.callback, false)
    await vi.waitFor(() => expect(stub.fn).toHaveBeenCalled())
    stub.resolve('done content')
    await first.settled

    const late: GenerateChapterEvent[] = []
    stream.subscribe(BOOK.id, (e) => late.push(e), false)

    expect(late).toEqual([{ type: 'done', chapterNum: 2 }])
  })

  it('immediately replays the error event to a subscriber that joins after a failure', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(BOOK)
    const stub = makeStubGenerateNextChapter()
    const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn })
    const first = collectUntilTerminal()
    stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6' })
    stream.subscribe(BOOK.id, first.callback, false)
    await vi.waitFor(() => expect(stub.fn).toHaveBeenCalled())
    stub.reject(new Error('boom'))
    await first.settled

    const late: GenerateChapterEvent[] = []
    stream.subscribe(BOOK.id, (e) => late.push(e), false)

    expect(late).toEqual([{ type: 'error', message: 'boom' }])
  })

  it('returns a no-op unsubscribe for a book with no active generation', () => {
    const books = createFakeBookRepository()
    const stream = createChapterGenerationStream({ books, generateNextChapter: makeStubGenerateNextChapter().fn })
    const events: GenerateChapterEvent[] = []
    const unsubscribe = stream.subscribe('never-started', (e) => events.push(e), true)
    expect(() => unsubscribe()).not.toThrow()
    expect(events).toEqual([])
  })

  it('stops delivering events to a subscriber once it unsubscribes, without affecting others', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(BOOK)
    const stub = makeStubGenerateNextChapter()
    const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn })

    const quitterEvents: GenerateChapterEvent[] = []
    const stayerEvents: GenerateChapterEvent[] = []
    stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6' })
    const unsubscribeQuitter = stream.subscribe(BOOK.id, (e) => quitterEvents.push(e), false)
    stream.subscribe(BOOK.id, (e) => stayerEvents.push(e), false)
    await vi.waitFor(() => expect(stub.fn).toHaveBeenCalled())

    unsubscribeQuitter()
    stub.emitChunk('final content')
    stub.resolve('final content')
    await vi.waitFor(() => expect(stayerEvents.some(e => e.type === 'done')).toBe(true))

    expect(quitterEvents).toEqual([])
    expect(stayerEvents).toEqual([
      { type: 'chapter', text: 'final content' },
      { type: 'done', chapterNum: 2 },
    ])
  })

  describe('seedInterrupted', () => {
    it('makes getStatus report an active, errored generation carrying the given chapter number and message', () => {
      const books = createFakeBookRepository()
      const stream = createChapterGenerationStream({ books, generateNextChapter: makeStubGenerateNextChapter().fn })

      stream.seedInterrupted(BOOK.id, 3, 'Interrupted by restart')

      expect(stream.getStatus(BOOK.id)).toEqual({
        active: true,
        chapterNum: 3,
        stage: 'error',
        contentLength: 0,
        error: 'Interrupted by restart',
      })
    })

    it('leaves isGenerating false for a seeded state, same as any other errored generation', () => {
      const books = createFakeBookRepository()
      const stream = createChapterGenerationStream({ books, generateNextChapter: makeStubGenerateNextChapter().fn })

      stream.seedInterrupted(BOOK.id, 3, 'Interrupted by restart')

      expect(stream.isGenerating(BOOK.id)).toBe(false)
    })

    // The regression that matters: a state seeded at boot has no subscriber
    // watching it yet, so unlike every other terminal state it must NOT be
    // evicted on a timer. A user who does not open this book's reader for
    // hours must still find the error waiting when they do.
    it('survives well past GENERATION_STREAM_CLEANUP_MS, unlike a generation that reached a terminal state live', async () => {
      vi.useFakeTimers()
      try {
        const books = createFakeBookRepository()
        const stream = createChapterGenerationStream({ books, generateNextChapter: makeStubGenerateNextChapter().fn })

        stream.seedInterrupted(BOOK.id, 3, 'Interrupted by restart')
        await vi.advanceTimersByTimeAsync(GENERATION_STREAM_CLEANUP_MS * 10)

        expect(stream.getStatus(BOOK.id)).toMatchObject({ active: true, stage: 'error' })
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('job journalling', () => {
    it('records a generate-chapter job while generation is in flight, and clears it once the generation settles', async () => {
      const books = createFakeBookRepository()
      await books.saveBook(BOOK)
      const stub = makeStubGenerateNextChapter()
      const journal = createFakeJobJournal()
      const clock = createFakeClock()
      const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn, journal, clock })

      stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6', targetChapterNum: 2 })
      await vi.waitFor(() => expect(stub.fn).toHaveBeenCalled())

      const inFlight = await journal.listInterrupted()
      expect(inFlight).toHaveLength(1)
      expect(inFlight[0]).toMatchObject({
        type: 'generate-chapter',
        bookId: BOOK.id,
        bookTitle: BOOK.title,
        checkpoint: { kind: 'none' },
        params: { model: 'claude-sonnet-4-6', targetChapterNum: 2 },
      })

      stub.resolve('the chapter text')
      await vi.waitFor(async () => {
        expect(await journal.listInterrupted()).toEqual([])
      })
    })

    it('clears the journal record on an error settlement too, not only on success', async () => {
      const books = createFakeBookRepository()
      await books.saveBook(BOOK)
      const stub = makeStubGenerateNextChapter()
      const journal = createFakeJobJournal()
      const clock = createFakeClock()
      const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn, journal, clock })

      stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6' })
      await vi.waitFor(() => expect(stub.fn).toHaveBeenCalled())
      expect(await journal.listInterrupted()).toHaveLength(1)

      stub.reject(new Error('model exploded'))
      await vi.waitFor(async () => {
        expect(await journal.listInterrupted()).toEqual([])
      })
    })

    it('never writes to the journal when none was supplied, the same as every pre-existing test in this file', async () => {
      const books = createFakeBookRepository()
      await books.saveBook(BOOK)
      const stub = makeStubGenerateNextChapter()
      const stream = createChapterGenerationStream({ books, generateNextChapter: stub.fn })

      expect(() => stream.startGeneration(BOOK.id, { model: 'claude-sonnet-4-6' })).not.toThrow()
      await vi.waitFor(() => expect(stub.fn).toHaveBeenCalled())
      stub.resolve('the chapter text')
      await vi.waitFor(() => expect(stream.isGenerating(BOOK.id)).toBe(false))
    })
  })
})
