import type { BookRepository } from '../ports/book-repository.js'
import type { Toc } from '@shared/domain.js'
import type { BookDetail, GenerationStatus } from '@shared/responses.js'

export interface GetBookDetailDeps {
  books: BookRepository
  /** Reads current in-memory chapter-generation state. Not a port: it is
   * synchronous, process-local state owned by the shared ChapterGenerationStream
   * instance composition-root.ts builds, not an external dependency, so it's
   * injected as a plain function rather than added to the Ports interface. */
  getGenerationStatus: (bookId: string) => GenerationStatus
}

/** GET /api/books/:id — book meta plus the current generation status. */
export function createGetBookDetail({ books, getGenerationStatus }: GetBookDetailDeps) {
  return async function getBookDetail(bookId: string): Promise<BookDetail> {
    const meta = await books.getBook(bookId)
    return { ...meta, generation: getGenerationStatus(bookId) }
  }
}

export interface GetBookTocDeps {
  books: BookRepository
}

/** GET /api/books/:id/toc — the approved table of contents. */
export function createGetBookToc({ books }: GetBookTocDeps) {
  return async function getBookToc(bookId: string): Promise<Toc> {
    return books.getToc(bookId)
  }
}
