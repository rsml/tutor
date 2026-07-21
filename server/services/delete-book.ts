import type { BookRepository } from '../ports/book-repository.js'
import type { ArtifactStore } from '../ports/artifact-store.js'

export interface DeleteBookDeps {
  books: BookRepository
  artifacts: ArtifactStore
}

/**
 * DELETE /api/books/:id.
 *
 * Explicitly deletes the cover and audiobook artifacts before the book
 * record itself. The real filesystem adapter's deleteBook() already removes
 * the whole per-book directory, so today this is a belt-and-braces no-op on
 * top of that. It stops being a no-op the moment BookRepository and
 * ArtifactStore are backed by anything that doesn't share one directory, and
 * it is what lets this behaviour, "deleting a book removes its artifacts",
 * be asserted and tested here at all, since the two fakes don't share
 * storage the way the real directory-per-book layout does.
 */
export function createDeleteBook({ books, artifacts }: DeleteBookDeps) {
  return async function deleteBook(bookId: string): Promise<void> {
    await artifacts.deleteCover(bookId)
    await artifacts.deleteAudiobookArtifacts(bookId)
    await books.deleteBook(bookId)
  }
}
