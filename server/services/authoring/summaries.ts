import type { BookRepository } from '../../ports/book-repository.js'
import type { ChapterSummary } from '@shared/domain.js'
import { assertChapterInRange } from '../../domain/chapter-range.js'

export interface SummariesDeps {
  books: BookRepository
}

/** PUT /api/books/:id/summaries/:num — authoring write of a chapter summary. */
export function createSaveSummary({ books }: SummariesDeps) {
  return async function saveSummary(bookId: string, chapterNum: number, summary: ChapterSummary): Promise<void> {
    const meta = await books.getBook(bookId)
    assertChapterInRange(meta.totalChapters, chapterNum)
    await books.saveSummary(bookId, chapterNum, summary)
  }
}

/** GET /api/books/:id/summaries. */
export function createGetAllSummaries({ books }: SummariesDeps) {
  return async function getAllSummaries(bookId: string): Promise<ChapterSummary[]> {
    return books.getAllSummaries(bookId)
  }
}
