import { describe, it, expect } from 'vitest'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import type { BookMeta } from '@shared/domain.js'
import { createSubmitFeedback } from './submit-feedback.js'

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1', title: 'T', prompt: 'P', status: 'reading',
    totalChapters: 3, generatedUpTo: 2, createdAt: '', updatedAt: '',
    tags: [], audioGeneratedChapters: [],
    ...overrides,
  }
}

describe('createSubmitFeedback', () => {
  it('computes quiz.score from quizAnswers against a saved quiz, counting a right answer and rejecting a wrong one', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())
    await books.saveQuiz('book-1', 1, {
      questions: [
        { question: 'Q1?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 },
        { question: 'Q2?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 },
      ],
    })

    const submitFeedback = createSubmitFeedback({ books })
    const result = await submitFeedback({ bookId: 'book-1', chapter: 1, liked: 'the intro', quizAnswers: [0, 2] })

    expect(result).toEqual({ ok: true })
    const saved = await books.getFeedback('book-1', 1)
    expect(saved.quiz.score).toBe(1)
    expect(saved.quiz.questions[0]).toMatchObject({ userAnswer: 0, correct: true })
    expect(saved.quiz.questions[1]).toMatchObject({ userAnswer: 2, correct: false })
    expect(saved.feedback).toEqual({ liked: 'the intro', disliked: undefined })
  })

  it('stores empty questions and a zero score when no quiz exists for the chapter', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())

    const submitFeedback = createSubmitFeedback({ books })
    await submitFeedback({ bookId: 'book-1', chapter: 1, liked: 'nice' })

    const saved = await books.getFeedback('book-1', 1)
    expect(saved.quiz.questions).toEqual([])
    expect(saved.quiz.score).toBe(0)
  })

  it('rejects with a 400 when the chapter number is out of the book\'s range', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook({ totalChapters: 2 }))

    const submitFeedback = createSubmitFeedback({ books })
    await expect(submitFeedback({ bookId: 'book-1', chapter: 5 })).rejects.toMatchObject({
      message: 'Chapter 5 out of range (1-2)',
      statusCode: 400,
    })
  })

  it('saves the chapter number as given, independent of the quiz lookup', async () => {
    const books = createFakeBookRepository()
    await books.saveBook(makeBook())

    const submitFeedback = createSubmitFeedback({ books })
    await submitFeedback({ bookId: 'book-1', chapter: 2, disliked: 'too slow' })

    const saved = await books.getFeedback('book-1', 2)
    expect(saved.chapter).toBe(2)
    expect(saved.feedback.disliked).toBe('too slow')
  })
})
