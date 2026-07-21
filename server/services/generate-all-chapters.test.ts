import { describe, expect, it, vi } from 'vitest'
import type { BookMeta } from '@shared/domain.js'
import { createFakeBackgroundTasks } from '../ports/background-tasks.fake.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createChapterGenerationStream, type ChapterGenerationStream } from './chapter-generation-stream.js'
import { createGenerateAllChapters } from './generate-all-chapters.js'
import type { GenerateNextChapterOptions } from './generate-next-chapter.js'

const META = { title: 'Distributed Systems', generatedUpTo: 0, totalChapters: 3 }

/** Never reports an active single-chapter generation — the common case for these tests. */
const idleChapterStream: ChapterGenerationStream = {
  isGenerating: () => false,
  getStatus: () => ({ active: false }),
  subscribe: () => () => {},
  startGeneration: () => {},
}

/** A stub GenerateNextChapter whose per-call behaviour is scripted per chapter number. */
function makeStubGenerateNextChapter(behaviors: Record<number, 'resolve' | Error>) {
  const calls: Array<{ bookId: string; chapterNum: number; signal: AbortSignal | undefined }> = []
  const fn = vi.fn(async (
    bookId: string,
    chapterNum: number,
    _options: GenerateNextChapterOptions,
    _onChunk: ((text: string) => void) | undefined,
    signal: AbortSignal | undefined,
  ): Promise<string> => {
    calls.push({ bookId, chapterNum, signal })
    const behavior = behaviors[chapterNum] ?? 'resolve'
    if (behavior instanceof Error) throw behavior
    return `chapter ${chapterNum} content`
  })
  return { fn, calls }
}

describe('createGenerateAllChapters', () => {
  it('starts a generate-all task and returns its id', () => {
    const backgroundTasks = createFakeBackgroundTasks()
    const stub = makeStubGenerateNextChapter({})
    const generateAllChapters = createGenerateAllChapters({ backgroundTasks, chapterStream: idleChapterStream, generateNextChapter: stub.fn })

    const { taskId } = generateAllChapters('book-1', META, { model: 'claude-sonnet-4-6' })

    const task = backgroundTasks.get(taskId)
    expect(task).toMatchObject({ type: 'generate-all', bookId: 'book-1', bookTitle: 'Distributed Systems', status: 'running' })
  })

  it('generates every remaining chapter in order, reporting progress before each', async () => {
    const backgroundTasks = createFakeBackgroundTasks()
    const stub = makeStubGenerateNextChapter({})
    const generateAllChapters = createGenerateAllChapters({ backgroundTasks, chapterStream: idleChapterStream, generateNextChapter: stub.fn })

    const { taskId } = generateAllChapters('book-1', META, { model: 'claude-sonnet-4-6' })
    await vi.waitFor(() => expect(backgroundTasks.get(taskId)?.status).toBe('done'))

    expect(stub.calls.map(c => c.chapterNum)).toEqual([1, 2, 3])
    expect(backgroundTasks.get(taskId)?.progress).toMatchObject({ current: 3, total: 3 })
  })

  it('fails the task and stops when a chapter fails to generate, without trying later chapters', async () => {
    const backgroundTasks = createFakeBackgroundTasks()
    const stub = makeStubGenerateNextChapter({ 2: new Error('model exploded') })
    const generateAllChapters = createGenerateAllChapters({ backgroundTasks, chapterStream: idleChapterStream, generateNextChapter: stub.fn })

    const { taskId } = generateAllChapters('book-1', META, { model: 'claude-sonnet-4-6' })
    await vi.waitFor(() => expect(backgroundTasks.get(taskId)?.status).toBe('error'))

    expect(stub.calls.map(c => c.chapterNum)).toEqual([1, 2])
    expect(backgroundTasks.get(taskId)?.error).toBe('model exploded')
  })

  it('passes the task cancellation signal through to generateNextChapter', async () => {
    const backgroundTasks = createFakeBackgroundTasks()
    const stub = makeStubGenerateNextChapter({})
    const generateAllChapters = createGenerateAllChapters({ backgroundTasks, chapterStream: idleChapterStream, generateNextChapter: stub.fn })

    const { taskId } = generateAllChapters('book-1', META, { model: 'claude-sonnet-4-6' })
    await vi.waitFor(() => expect(backgroundTasks.get(taskId)?.status).toBe('done'))

    expect(stub.calls[0].signal).toBeInstanceOf(AbortSignal)
  })

  it('stops generating further chapters once the task is cancelled, without failing or succeeding it', async () => {
    const backgroundTasks = createFakeBackgroundTasks()
    // The IIFE inside generateAllChapters runs synchronously up to its first
    // await, which includes this very call, so `taskId` is not yet known to
    // the test at the point chapter 1's stub runs. Looking the active task
    // up by bookId instead of capturing its id sidesteps that ordering.
    const fn = vi.fn(async (
      bookId: string,
      chapterNum: number,
    ): Promise<string> => {
      if (chapterNum === 1) {
        const active = backgroundTasks.findActive(bookId, 'generate-all')
        if (active) backgroundTasks.cancel(active.id)
      }
      return `chapter ${chapterNum}`
    })
    const generateAllChapters = createGenerateAllChapters({ backgroundTasks, chapterStream: idleChapterStream, generateNextChapter: fn })

    const { taskId } = generateAllChapters('book-1', META, { model: 'claude-sonnet-4-6' })

    await vi.waitFor(() => expect(backgroundTasks.get(taskId)?.status).toBe('cancelled'))
    // Give the fire-and-forget loop a beat to (not) start chapter 2.
    await new Promise(r => setTimeout(r, 20))

    expect(fn.mock.calls.map(c => c[1])).toEqual([1])
    expect(backgroundTasks.get(taskId)?.status).toBe('cancelled')
  })

  it('waits for an active single-chapter generation on the same book, then proceeds once it clears', async () => {
    vi.useFakeTimers()
    try {
      const backgroundTasks = createFakeBackgroundTasks()
      const books = createFakeBookRepository()
      const bookMeta: BookMeta = {
        id: 'book-1', title: 'Distributed Systems', prompt: 'x', status: 'reading',
        totalChapters: 3, generatedUpTo: 0, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
        tags: [], audioGeneratedChapters: [],
      }
      await books.saveBook(bookMeta)
      await books.saveToc('book-1', { chapters: [{ title: 'A', description: 'a' }] })

      let resolveSingleChapter!: (content: string) => void
      const singleChapterPromise = new Promise<string>((resolve) => { resolveSingleChapter = resolve })
      const chapterStream = createChapterGenerationStream({
        books,
        generateNextChapter: vi.fn(async () => singleChapterPromise),
      })
      chapterStream.startGeneration('book-1', { model: 'claude-sonnet-4-6' })
      expect(chapterStream.isGenerating('book-1')).toBe(true)

      const stub = makeStubGenerateNextChapter({})
      const generateAllChapters = createGenerateAllChapters({ backgroundTasks, chapterStream, generateNextChapter: stub.fn })
      generateAllChapters('book-1', META, { model: 'claude-sonnet-4-6' })

      await vi.advanceTimersByTimeAsync(10)
      expect(stub.fn).not.toHaveBeenCalled()

      resolveSingleChapter('the single chapter')
      await vi.advanceTimersByTimeAsync(0)
      expect(chapterStream.isGenerating('book-1')).toBe(false)

      // The poll loop is parked on a 1s setTimeout; advance past it so it re-checks.
      await vi.advanceTimersByTimeAsync(1000)
      expect(stub.fn).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
