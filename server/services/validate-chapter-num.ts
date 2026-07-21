import type { BookRepository } from '../ports/book-repository.js'
import { assertChapterInRange } from '../domain/chapter-range.js'

/**
 * Rejects with a 400 error when chapterNum is out of the book's chapter
 * range (1..totalChapters). The I/O wrapper around domain/chapter-range.ts's
 * pure assertChapterInRange: it takes a BookRepository as an argument to
 * fetch the book's totalChapters, so any service built on this stays unit
 * testable against createFakeBookRepository() with no real filesystem I/O,
 * and the message text and statusCode can never drift from the pure check.
 *
 * A book that does not exist at all rejects with the repository's own
 * NotFoundError (code 'ENOENT'), unchanged, which the app's error handler
 * already renders as 404.
 */
export async function validateChapterNum(books: BookRepository, bookId: string, num: number): Promise<void> {
  const meta = await books.getBook(bookId)
  assertChapterInRange(meta.totalChapters, num)
}
