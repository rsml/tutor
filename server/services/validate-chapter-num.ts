import type { BookRepository } from '../ports/book-repository.js'

/**
 * Rejects with a 400 error when chapterNum is out of the book's chapter
 * range (1..totalChapters). This mirrors domain/chapter-range.ts's
 * validateChapterNum exactly — same message text, same statusCode — but
 * takes its BookRepository as an argument instead of reaching for the
 * book-store.js shim internally, so any service built on this stays unit
 * testable against createFakeBookRepository() with no real filesystem I/O.
 *
 * A book that does not exist at all rejects with the repository's own
 * NotFoundError (code 'ENOENT'), unchanged, which the app's error handler
 * already renders as 404.
 */
export async function validateChapterNum(books: BookRepository, bookId: string, num: number): Promise<void> {
  const meta = await books.getBook(bookId)
  if (num < 1 || num > meta.totalChapters) {
    const err = new Error(`Chapter ${num} out of range (1-${meta.totalChapters})`)
    ;(err as Error & { statusCode?: number }).statusCode = 400
    throw err
  }
}
