import type { BookRepository } from '../../ports/book-repository.js'
import { assertChapterInRange } from '../../domain/chapter-range.js'

export interface SaveChapterContentDeps {
  books: BookRepository
}

/** PUT /api/books/:id/chapters/:num/content — authoring write of chapter markdown. */
export function createSaveChapterContent({ books }: SaveChapterContentDeps) {
  return async function saveChapterContent(bookId: string, chapterNum: number, content: string): Promise<void> {
    const meta = await books.getBook(bookId)
    assertChapterInRange(meta.totalChapters, chapterNum)
    await books.saveChapter(bookId, chapterNum, content)
  }
}
