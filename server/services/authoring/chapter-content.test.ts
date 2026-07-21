import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../../ports/book-repository.fake.js'
import { createSaveChapterContent } from './chapter-content.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/authoring/chapter-content.ts exists,
// against the BookRepository fake. Moves
// PUT /api/books/:id/chapters/:num/content out of authoring.ts.

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Test Book',
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

describe('saveChapterContent', () => {
  it('saves chapter markdown so it can be read back', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const saveChapterContent = createSaveChapterContent({ books })

    await saveChapterContent('book-1', 1, '# Chapter One\n\nBody.')

    expect(await books.getChapter('book-1', 1)).toBe('# Chapter One\n\nBody.')
  })

  it('rejects a chapter number outside the book range with a 400', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ totalChapters: 2 }))
    const saveChapterContent = createSaveChapterContent({ books })

    await expect(saveChapterContent('book-1', 5, 'content')).rejects.toMatchObject({ statusCode: 400 })
  })
})
