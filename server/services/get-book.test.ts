import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { NotFoundError } from '../ports/book-repository.js'
import { createGetBookDetail, createGetBookToc } from './get-book.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/get-book.ts exists, against the
// BookRepository fake. Moves GET /api/books/:id and GET /api/books/:id/toc
// out of server/routes/library.ts.

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

describe('getBookDetail', () => {
  it('merges the generation status onto the book meta', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const getBookDetail = createGetBookDetail({ books, getGenerationStatus: () => ({ active: false }) })
    const result = await getBookDetail('book-1')
    expect(result.id).toBe('book-1')
    expect(result.generation).toEqual({ active: false })
  })

  it('passes the active generation status through verbatim', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const getBookDetail = createGetBookDetail({
      books,
      getGenerationStatus: () => ({ active: true, chapterNum: 2, stage: 'streaming', contentLength: 42 }),
    })
    const result = await getBookDetail('book-1')
    expect(result.generation).toEqual({ active: true, chapterNum: 2, stage: 'streaming', contentLength: 42 })
  })

  it('propagates NotFoundError for an unknown book', async () => {
    const books = createFakeBookRepository()
    const getBookDetail = createGetBookDetail({ books, getGenerationStatus: () => ({ active: false }) })
    await expect(getBookDetail('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('getBookToc', () => {
  it('returns the saved table of contents', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveToc('book-1', { chapters: [{ title: 'One', description: 'd' }] })
    const getBookToc = createGetBookToc({ books })
    await expect(getBookToc('book-1')).resolves.toEqual({ chapters: [{ title: 'One', description: 'd' }] })
  })

  it('propagates NotFoundError when no toc has been saved', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const getBookToc = createGetBookToc({ books })
    await expect(getBookToc('book-1')).rejects.toThrow(NotFoundError)
  })
})
