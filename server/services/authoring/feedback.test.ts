import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../../ports/book-repository.fake.js'
import { createGetAllFeedback } from './feedback.js'

// TDD: written before server/services/authoring/feedback.ts exists, against
// the BookRepository fake. Moves GET /api/books/:id/feedback out of
// authoring.ts.

describe('getAllFeedback', () => {
  it('returns feedback sorted by chapter', async () => {
    const books = createFakeBookRepository()
    await books.saveFeedback('book-1', 2, { chapter: 2, feedback: {}, quiz: { questions: [] } })
    await books.saveFeedback('book-1', 1, { chapter: 1, feedback: { liked: 'intro' }, quiz: { questions: [] } })
    const getAllFeedback = createGetAllFeedback({ books })

    const feedback = await getAllFeedback('book-1')

    expect(feedback.map(f => f.chapter)).toEqual([1, 2])
  })

  it('returns an empty array when the book has no feedback yet', async () => {
    const getAllFeedback = createGetAllFeedback({ books: createFakeBookRepository() })
    await expect(getAllFeedback('book-1')).resolves.toEqual([])
  })
})
