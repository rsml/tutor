import type { BookRepository } from '../../ports/book-repository.js'
import type { Quiz } from '@shared/domain.js'
import { assertChapterInRange } from '../../domain/chapter-range.js'

export interface SaveQuizDeps {
  books: BookRepository
}

/** PUT /api/books/:id/quiz/:num — authoring write of a chapter's quiz. */
export function createSaveQuiz({ books }: SaveQuizDeps) {
  return async function saveQuiz(bookId: string, chapterNum: number, quiz: Quiz): Promise<void> {
    const meta = await books.getBook(bookId)
    assertChapterInRange(meta.totalChapters, chapterNum)
    await books.saveQuiz(bookId, chapterNum, quiz)
  }
}
