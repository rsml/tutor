import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createRecordChapterProgress } from './record-chapter-progress.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/record-chapter-progress.ts exists,
// against the BookRepository fake. Moves PUT /api/books/:id/progress/:num
// out of server/routes/reading.ts.
//
// The reader marks a chapter complete client-side once scroll reaches 90%
// (see useScrollProgress in the client) and sends completed accordingly;
// the server has never recomputed that threshold itself, only persisted
// whatever the client sent, so these tests pin persistence and the derived
// chaptersRead count rather than inventing a server-side threshold check.

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

describe('recordChapterProgress', () => {
  it('marks a chapter complete once progress arrives with completed true', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const recordChapterProgress = createRecordChapterProgress({ books })

    await recordChapterProgress('book-1', 1, { scroll: 0.95, completed: true, completedAt: '2026-01-02T00:00:00.000Z' })

    expect(await books.getChaptersRead('book-1')).toBe(1)
  })

  it('does not count a chapter as read while progress is below the completion threshold', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const recordChapterProgress = createRecordChapterProgress({ books })

    await recordChapterProgress('book-1', 1, { scroll: 0.5, completed: false })

    expect(await books.getChaptersRead('book-1')).toBe(0)
    expect((await books.getProgress('book-1')).chapters['1'].scroll).toBe(0.5)
  })

  it('rejects a chapter number outside the book range with a 400', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ totalChapters: 2 }))
    const recordChapterProgress = createRecordChapterProgress({ books })

    await expect(
      recordChapterProgress('book-1', 5, { scroll: 1, completed: true }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
