import type { z } from 'zod'
import type { BookRepository } from '../ports/book-repository.js'
import type { Clock } from '../ports/clock.js'
import type { RatingBodySchema } from '@shared/contracts.js'

export type RatingBody = z.infer<typeof RatingBodySchema>

export interface RateBookDeps {
  books: BookRepository
  clock: Clock
}

/**
 * PUT /api/books/:id/rating. A rating of exactly 0 removes the field rather
 * than storing a zero, matching the "no rating yet" state the reader UI
 * treats as unrated. Submitting a finalQuizScore alongside a rating also
 * marks the book complete, which is how finishing a book's final quiz is
 * recorded today.
 */
export function createRateBook({ books, clock }: RateBookDeps) {
  return async function rateBook(bookId: string, body: RatingBody): Promise<void> {
    const meta = await books.getBook(bookId)
    if (body.rating === 0) {
      delete meta.rating
    } else {
      meta.rating = body.rating
    }
    if (body.finalQuizScore !== undefined) {
      meta.finalQuizScore = body.finalQuizScore
      meta.finalQuizTotal = body.finalQuizTotal
      meta.status = 'complete'
    }
    meta.updatedAt = clock.nowIso()
    await books.saveBook(meta)
  }
}
