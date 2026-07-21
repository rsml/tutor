import type { Quiz } from '@shared/domain.js'
import { DEFAULT_PROVIDER } from '@shared/provider.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { TextGeneration } from '../ports/text-generation.js'
import { DEFAULT_MODEL, DEFAULT_QUIZ_LENGTH } from '../constants.js'
import { createGenerateQuiz } from './generate-quiz.js'
import { validateChapterNum } from './validate-chapter-num.js'

/**
 * Fetches a chapter's quiz, generating one on demand if it was never saved
 * (e.g. the reader reconnects to a chapter whose quiz file went missing).
 * On-demand generation always includes the shared markdown formatting
 * rules, matching the chapter-N quiz prompt every other chapter's
 * generation has always used (see generate-quiz.ts's own doc for why that
 * flag defaults to false but this call site sets it explicitly).
 */

export interface GetChapterQuizDeps {
  books: BookRepository
  textGeneration: TextGeneration
}

export interface GetChapterQuizRequest {
  bookId: string
  chapterNum: number
  model?: string
  provider?: string
  quizLength?: number
}

export function createGetChapterQuiz(deps: GetChapterQuizDeps) {
  const generateQuiz = createGenerateQuiz({ ai: deps.textGeneration })

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

    const quiz = await generateQuiz({ provider, model, chapterContent, quizLength, includeFormattingRules: true })
    await deps.books.saveQuiz(bookId, chapterNum, quiz)
    return quiz
  }
}
