import type { Quiz } from '@shared/domain.js'
import { DEFAULT_PROVIDER } from '@shared/provider.js'
import type { BookRepository } from '../ports/book-repository.js'
import { DEFAULT_MODEL, DEFAULT_QUIZ_LENGTH } from '../constants.js'
import { generateQuiz } from './generation-manager.js'
import { validateChapterNum } from './validate-chapter-num.js'

/**
 * Fetches a chapter's quiz, generating one on demand if it was never saved
 * (e.g. the reader reconnects to a chapter whose quiz file went missing).
 * On-demand generation still delegates to generation-manager.ts's
 * generateQuiz — that module is a sibling slice's and is not converted to
 * the TextGeneration port here, so this service changes nothing about how
 * that quiz gets built, only how the chapter and quiz are read and saved.
 */

export interface GetChapterQuizDeps {
  books: BookRepository
}

export interface GetChapterQuizRequest {
  bookId: string
  chapterNum: number
  model?: string
  provider?: string
  quizLength?: number
}

export function createGetChapterQuiz(deps: GetChapterQuizDeps) {
  return async function getChapterQuiz(req: GetChapterQuizRequest): Promise<Quiz> {
    const { bookId, chapterNum } = req
    await validateChapterNum(deps.books, bookId, chapterNum)

    try {
      return await deps.books.getQuiz(bookId, chapterNum)
    } catch {
      // Quiz not saved yet — generate on demand below if chapter content exists.
    }

    const chapterContent = await deps.books.getChapter(bookId, chapterNum)
    const model = req.model || DEFAULT_MODEL
    const provider = req.provider || DEFAULT_PROVIDER
    const quizLength = req.quizLength ?? DEFAULT_QUIZ_LENGTH

    const quiz = await generateQuiz(provider, model, chapterContent, quizLength)
    await deps.books.saveQuiz(bookId, chapterNum, quiz)
    return quiz
  }
}
