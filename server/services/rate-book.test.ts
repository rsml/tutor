import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeClock } from '../ports/clock.fake.js'
import { RatingBodySchema } from '@shared/contracts.js'
import { createRateBook } from './rate-book.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/rate-book.ts exists, against the
// BookRepository fake and a controllable fake clock. Moves
// PUT /api/books/:id/rating out of server/routes/library.ts.

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

describe('rateBook', () => {
  it('sets a rating', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const rateBook = createRateBook({ books, clock: createFakeClock() })

    await rateBook('book-1', { rating: 4 })

    expect((await books.getBook('book-1')).rating).toBe(4)
  })

  it('deletes the rating field when rating is 0', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ rating: 4 }))
    const rateBook = createRateBook({ books, clock: createFakeClock() })

    await rateBook('book-1', { rating: 0 })

    expect((await books.getBook('book-1')).rating).toBeUndefined()
  })

  it('marks the book complete when a finalQuizScore is submitted', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ status: 'reading' }))
    const rateBook = createRateBook({ books, clock: createFakeClock() })

    await rateBook('book-1', { rating: 5, finalQuizScore: 8, finalQuizTotal: 10 })

    const meta = await books.getBook('book-1')
    expect(meta.status).toBe('complete')
    expect(meta.finalQuizScore).toBe(8)
    expect(meta.finalQuizTotal).toBe(10)
  })

  it('does not touch status when no finalQuizScore is submitted', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ status: 'reading' }))
    const rateBook = createRateBook({ books, clock: createFakeClock() })

    await rateBook('book-1', { rating: 3 })

    expect((await books.getBook('book-1')).status).toBe('reading')
  })

  it('refreshes updatedAt from the clock', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const clock = createFakeClock()
    clock.set('2026-07-01T00:00:00.000Z')
    const rateBook = createRateBook({ books, clock })

    await rateBook('book-1', { rating: 2 })

    expect((await books.getBook('book-1')).updatedAt).toBe('2026-07-01T00:00:00.000Z')
  })

  // Enforced by RatingBodySchema at the route via parseBody(), not by this
  // service, since by the time rateBook() runs the body is already valid.
  // Asserted here so the rule stays pinned somewhere in the service's own
  // test file rather than only implicitly, since it's unchanged today.
  it('rejects a rating outside 0-5 at the schema boundary', () => {
    expect(RatingBodySchema.safeParse({ rating: 10 }).success).toBe(false)
    expect(RatingBodySchema.safeParse({ rating: -1 }).success).toBe(false)
    expect(RatingBodySchema.safeParse({ rating: 0.3 }).success).toBe(false) // not a multiple of 0.5
  })
})
