import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeClock } from '../ports/clock.fake.js'
import { createUpdateBookDetails } from './update-book-details.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/update-book-details.ts exists, against
// the BookRepository fake and a controllable fake clock. Moves the
// PATCH /api/books/:id field-merge logic out of server/routes/library.ts.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Original Title',
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

describe('updateBookDetails', () => {
  it('updates the title and refreshes updatedAt from the clock', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const clock = createFakeClock()
    clock.set('2026-06-01T00:00:00.000Z')
    const updateBookDetails = createUpdateBookDetails({ books, clock })

    await updateBookDetails('book-1', { title: 'New Title' })

    const meta = await books.getBook('book-1')
    expect(meta.title).toBe('New Title')
    expect(meta.updatedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('lowercases and hyphenates tags, dropping blanks', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const updateBookDetails = createUpdateBookDetails({ books, clock: createFakeClock() })

    await updateBookDetails('book-1', { tags: ['Deep Learning', 'AI Basics', '  '] })

    const meta = await books.getBook('book-1')
    expect(meta.tags).toEqual(['deep-learning', 'ai-basics'])
  })

  it('leaves fields the patch omits untouched', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ subtitle: 'Keep me' }))
    const updateBookDetails = createUpdateBookDetails({ books, clock: createFakeClock() })

    await updateBookDetails('book-1', { title: 'New Title' })

    const meta = await books.getBook('book-1')
    expect(meta.subtitle).toBe('Keep me')
  })

  it('removes series, seriesOrder, and sortOrder when patched to null', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ series: 'Trilogy', seriesOrder: 2, sortOrder: 5 }))
    const updateBookDetails = createUpdateBookDetails({ books, clock: createFakeClock() })

    await updateBookDetails('book-1', { series: null, seriesOrder: null, sortOrder: null })

    const meta = await books.getBook('book-1')
    expect(meta.series).toBeNull()
    expect(meta.seriesOrder).toBeNull()
    expect(meta.sortOrder).toBeNull()
  })

  it('sets showTitleOnCover', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const updateBookDetails = createUpdateBookDetails({ books, clock: createFakeClock() })

    await updateBookDetails('book-1', { showTitleOnCover: true })

    expect((await books.getBook('book-1')).showTitleOnCover).toBe(true)
  })
})
