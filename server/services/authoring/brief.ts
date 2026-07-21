import type { BookRepository } from '../../ports/book-repository.js'

export interface BriefDeps {
  books: BookRepository
}

/** PUT /api/books/:id/brief — saves the generation brief the book was built from. */
export function createSaveBrief({ books }: BriefDeps) {
  return async function saveBrief(bookId: string, content: string): Promise<void> {
    await books.saveBrief(bookId, content)
  }
}

/** GET /api/books/:id/brief. */
export function createGetBrief({ books }: BriefDeps) {
  return async function getBrief(bookId: string): Promise<string> {
    return books.getBrief(bookId)
  }
}
