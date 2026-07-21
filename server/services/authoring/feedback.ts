import type { BookRepository } from '../../ports/book-repository.js'
import type { Feedback } from '@shared/domain.js'

export interface GetAllFeedbackDeps {
  books: BookRepository
}

/** GET /api/books/:id/feedback — every chapter's feedback, sorted by chapter. */
export function createGetAllFeedback({ books }: GetAllFeedbackDeps) {
  return async function getAllFeedback(bookId: string): Promise<Feedback[]> {
    return books.getAllFeedback(bookId)
  }
}
