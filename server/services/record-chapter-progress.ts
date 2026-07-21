import type { BookRepository } from '../ports/book-repository.js'
import type { ChapterProgress } from '@shared/domain.js'
import { assertChapterInRange } from '../domain/chapter-range.js'

export interface RecordChapterProgressDeps {
  books: BookRepository
}

/**
 * PUT /api/books/:id/progress/:num — persists scroll-based reading
 * progress for one chapter verbatim. The client decides `completed` (at
 * 90% scroll, see useScrollProgress), this just stores whatever it sends.
 */
export function createRecordChapterProgress({ books }: RecordChapterProgressDeps) {
  return async function recordChapterProgress(
    bookId: string,
    chapterNum: number,
    progress: ChapterProgress,
  ): Promise<void> {
    const meta = await books.getBook(bookId)
    assertChapterInRange(meta.totalChapters, chapterNum)
    await books.saveChapterProgress(bookId, chapterNum, progress)
  }
}
