import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../../ports/book-repository.fake.js'
import { createFakeClock } from '../../ports/clock.fake.js'
import { createUpdateBookMeta } from './book-meta.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/authoring/book-meta.ts exists, against
// the BookRepository fake and a controllable fake clock. Moves
// PATCH /api/books/:id/meta out of authoring.ts.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Original',
    prompt: 'Learn testing',
    status: 'generating',
    totalChapters: 3,
    generatedUpTo: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('updateBookMeta', () => {
  it('merges only the fields the patch supplies', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ subtitle: 'Keep me' }))
    const updateBookMeta = createUpdateBookMeta({ books, clock: createFakeClock() })

    await updateBookMeta('book-1', { generatedUpTo: 2 })

    const meta = await books.getBook('book-1')
    expect(meta.generatedUpTo).toBe(2)
    expect(meta.subtitle).toBe('Keep me')
    expect(meta.title).toBe('Original')
  })

  it('updates status and title together', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const updateBookMeta = createUpdateBookMeta({ books, clock: createFakeClock() })

    await updateBookMeta('book-1', { status: 'reading', title: 'New Title' })

    const meta = await books.getBook('book-1')
    expect(meta.status).toBe('reading')
    expect(meta.title).toBe('New Title')
  })

  it('refreshes updatedAt from the clock', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const clock = createFakeClock()
    clock.set('2026-05-01T00:00:00.000Z')
    const updateBookMeta = createUpdateBookMeta({ books, clock })

    await updateBookMeta('book-1', { generatedUpTo: 1 })

    expect((await books.getBook('book-1')).updatedAt).toBe('2026-05-01T00:00:00.000Z')
  })
})
