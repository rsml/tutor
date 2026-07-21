import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { NotFoundError } from '../ports/book-repository.js'
import { createReadChapter } from './read-chapter.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/read-chapter.ts exists, against the
// BookRepository fake. Moves GET /api/books/:id/chapters/:num out of
// server/routes/reading.ts, including its chapter-range guard, now checked
// with the pure assertChapterInRange against a book fetched through the
// injected BookRepository rather than the old bookId-resolving helper.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Test Book',
    prompt: 'Learn testing',
    status: 'reading',
    totalChapters: 3,
    generatedUpTo: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('readChapter', () => {
  it('returns the saved chapter content', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveChapter('book-1', 1, '# Chapter One\n\nContent.')
    const readChapter = createReadChapter({ books })

    await expect(readChapter('book-1', 1)).resolves.toBe('# Chapter One\n\nContent.')
  })

  it('rejects chapter 0 with a 400', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const readChapter = createReadChapter({ books })

    await expect(readChapter('book-1', 0)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a chapter number past totalChapters with a 400', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ totalChapters: 2 }))
    const readChapter = createReadChapter({ books })

    await expect(readChapter('book-1', 5)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Chapter 5 out of range'),
    })
  })

  it('propagates NotFoundError for an unknown book', async () => {
    const readChapter = createReadChapter({ books: createFakeBookRepository() })
    await expect(readChapter('missing', 1)).rejects.toThrow(NotFoundError)
  })
})
