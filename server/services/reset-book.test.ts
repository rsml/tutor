import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createResetBook } from './reset-book.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/reset-book.ts exists, against the
// BookRepository fake. Moves POST /api/books/:id/reset out of
// server/routes/library.ts, including its generating-state guard — the fake
// (and the real adapter) also refuse a resetBook() call while generating,
// but with a different plain Error and no statusCode, so the guard has to
// stay in front of that call rather than relying on it, to keep the 409
// and its body exactly as they are today.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Test Book',
    prompt: 'Learn testing',
    status: 'reading',
    totalChapters: 3,
    generatedUpTo: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('resetBook', () => {
  it('resets a reading book and clears its progress and feedback', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ status: 'reading' }))
    await books.saveChapterProgress('book-1', 1, { scroll: 1, completed: true, completedAt: '2026-01-02T00:00:00.000Z' })
    await books.saveFeedback('book-1', 1, { chapter: 1, feedback: { liked: 'the intro' }, quiz: { questions: [] } })

    const resetBook = createResetBook({ books })
    const result = await resetBook('book-1')

    expect(result).toEqual({ ok: true })
    expect(await books.getChaptersRead('book-1')).toBe(0)
    expect(await books.getAllFeedback('book-1')).toEqual([])
  })

  it('refuses to reset a book that is generating, without touching it', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ status: 'generating' }))
    const resetBook = createResetBook({ books })

    const result = await resetBook('book-1')

    expect(result).toEqual({ ok: false, reason: 'generating' })
    expect((await books.getBook('book-1')).status).toBe('generating')
  })

  it('refuses to reset a book that is generating its table of contents', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ status: 'generating_toc' }))
    const resetBook = createResetBook({ books })

    expect(await resetBook('book-1')).toEqual({ ok: false, reason: 'generating' })
  })
})
