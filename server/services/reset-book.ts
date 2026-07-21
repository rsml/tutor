import type { BookRepository } from '../ports/book-repository.js'

export type ResetBookResult = { ok: true } | { ok: false; reason: 'generating' }

export interface ResetBookDeps {
  books: BookRepository
}

/**
 * POST /api/books/:id/reset.
 *
 * The generating-state guard has to run here rather than being left to
 * BookRepository#resetBook's own guard, because that one rejects with a
 * plain Error (different message, no statusCode), which would 500 instead
 * of preserving today's 409 with `{ error: 'Cannot reset while generating' }`.
 * The route maps this result to that exact response; this function only
 * decides whether resetting is allowed right now.
 */
export function createResetBook({ books }: ResetBookDeps) {
  return async function resetBook(bookId: string): Promise<ResetBookResult> {
    const meta = await books.getBook(bookId)
    if (meta.status === 'generating' || meta.status === 'generating_toc') {
      return { ok: false, reason: 'generating' }
    }
    await books.resetBook(bookId)
    return { ok: true }
  }
}
