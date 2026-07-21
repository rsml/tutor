import type { Feedback } from '@shared/domain.js'
import type { BookRepository } from '../ports/book-repository.js'
import { scoreQuizAnswers, type ScoredQuiz } from '../domain/quiz-scoring.js'
import { validateChapterNum } from './validate-chapter-num.js'

/**
 * Records a reader's end-of-chapter feedback and, when the chapter has a
 * saved quiz, grades the reader's answers against it. A chapter with no
 * saved quiz stores an empty question list and a zero score rather than
 * failing, matching today's behaviour.
 */

export interface SubmitFeedbackDeps {
  books: BookRepository
}

export interface SubmitFeedbackRequest {
  bookId: string
  chapter: number
  liked?: string
  disliked?: string
  quizAnswers?: number[]
}

export function createSubmitFeedback(deps: SubmitFeedbackDeps) {
  return async function submitFeedback(req: SubmitFeedbackRequest): Promise<{ ok: true }> {
    const { bookId, chapter, liked, disliked, quizAnswers } = req
    await validateChapterNum(deps.books, bookId, chapter)

    let scored: ScoredQuiz = { questions: [], score: 0 }
    try {
      const quiz = await deps.books.getQuiz(bookId, chapter)
      scored = scoreQuizAnswers(quiz.questions, quizAnswers)
    } catch {
      // No quiz exists for this chapter.
    }

    const feedback: Feedback = {
      chapter,
      feedback: { liked, disliked },
      quiz: { questions: scored.questions, score: scored.score },
    }
    await deps.books.saveFeedback(bookId, chapter, feedback)
    return { ok: true }
  }
}
