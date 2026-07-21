import type { BookRepository } from '../ports/book-repository.js'
import { assertChapterInRange } from '../domain/chapter-range.js'

export interface ReadChapterDeps {
  books: BookRepository
}

/** GET /api/books/:id/chapters/:num — the chapter's saved markdown content. */
export function createReadChapter({ books }: ReadChapterDeps) {
  return async function readChapter(bookId: string, chapterNum: number): Promise<string> {
    const meta = await books.getBook(bookId)
    assertChapterInRange(meta.totalChapters, chapterNum)
    return books.getChapter(bookId, chapterNum)
  }
}
