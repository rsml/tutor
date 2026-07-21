import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../../ports/book-repository.fake.js'
import { createSaveSummary, createGetAllSummaries } from './summaries.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/authoring/summaries.ts exists, against
// the BookRepository fake. Moves PUT /api/books/:id/summaries/:num and
// GET /api/books/:id/summaries out of authoring.ts.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Test Book',
    prompt: 'Learn testing',
    status: 'generating',
    totalChapters: 2,
    generatedUpTo: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('summaries', () => {
  it('saves a chapter summary so it appears in getAllSummaries', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const saveSummary = createSaveSummary({ books })
    const getAllSummaries = createGetAllSummaries({ books })

    await saveSummary('book-1', 1, { summary: 'A summary.', keyPoints: ['point one'] })

    await expect(getAllSummaries('book-1')).resolves.toEqual([{ summary: 'A summary.', keyPoints: ['point one'] }])
  })

  it('returns an empty array when the book has no summaries yet', async () => {
    const getAllSummaries = createGetAllSummaries({ books: createFakeBookRepository() })
    await expect(getAllSummaries('book-1')).resolves.toEqual([])
  })

  it('rejects a chapter number outside the book range with a 400', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ totalChapters: 1 }))
    const saveSummary = createSaveSummary({ books })

    await expect(
      saveSummary('book-1', 5, { summary: 's', keyPoints: [] }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
