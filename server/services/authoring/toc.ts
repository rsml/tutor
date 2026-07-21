import type { BookRepository } from '../../ports/book-repository.js'
import type { Clock } from '../../ports/clock.js'
import type { TocChapter } from '@shared/domain.js'

export interface SaveAuthoringTocDeps {
  books: BookRepository
  clock: Clock
}

/**
 * PUT /api/books/:id/toc — the MCP authoring surface's direct TOC write,
 * distinct from the read-only GET of the same path in library.ts. Also
 * updates totalChapters to match the chapter count the new TOC declares.
 */
export function createSaveAuthoringToc({ books, clock }: SaveAuthoringTocDeps) {
  return async function saveAuthoringToc(bookId: string, chapters: TocChapter[]): Promise<void> {
    const meta = await books.getBook(bookId)
    meta.totalChapters = chapters.length
    meta.updatedAt = clock.nowIso()
    await books.saveBook(meta)
    await books.saveToc(bookId, { chapters })
  }
}
