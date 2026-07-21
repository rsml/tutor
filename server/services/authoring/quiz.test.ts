import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../../ports/book-repository.fake.js'
import { createSaveQuiz } from './quiz.js'
import type { BookMeta } from '@shared/domain.js'

// TDD: written before server/services/authoring/quiz.ts exists, against the
// BookRepository fake. Moves PUT /api/books/:id/quiz/:num out of
// authoring.ts.

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

describe('saveQuiz', () => {
  it('saves a quiz so it can be read back', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    const saveQuiz = createSaveQuiz({ books })
    const quiz = { questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 }] }

    await saveQuiz('book-1', 1, quiz)

    await expect(books.getQuiz('book-1', 1)).resolves.toEqual(quiz)
  })

  it('rejects a chapter number outside the book range with a 400', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ totalChapters: 1 }))
    const saveQuiz = createSaveQuiz({ books })

    await expect(
      saveQuiz('book-1', 5, { questions: [] }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
