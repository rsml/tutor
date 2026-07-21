import type { FastifyInstance } from 'fastify'
import { FeedbackBodySchema, FinalQuizBodySchema } from '@shared/contracts.js'
import { parseBody } from '../http/parse.js'
import { bookIdSchema, bookChapterSchema } from '../http/route-params.js'
import { createGetChapterQuiz } from '../services/get-chapter-quiz.js'
import { createSubmitFeedback } from '../services/submit-feedback.js'
import { createGenerateFinalQuiz } from '../services/generate-final-quiz.js'
import type { Ports } from '../composition-root.js'

/**
 * Chapter quizzes, chapter feedback, and the whole-book final quiz. Wiring
 * and request parsing only — the real work lives in server/services/
 * get-chapter-quiz.ts, submit-feedback.ts, and generate-final-quiz.ts.
 *
 * POST /api/books/:id/profile-suggestions used to live here too, a leftover
 * of the mechanical route split rather than a deliberate choice. It reads
 * as a suggestion (what should the learning profile become), not an
 * assessment, so its route registration now lives in suggestions.ts
 * alongside /api/books/suggest and /api/books/suggest-details.
 */
export async function assessmentRoutes(fastify: FastifyInstance, { ports }: { ports: Ports }) {
  const getChapterQuiz = createGetChapterQuiz({ books: ports.bookRepository })
  const submitFeedback = createSubmitFeedback({ books: ports.bookRepository })
  const generateFinalQuiz = createGenerateFinalQuiz({ books: ports.bookRepository, textGeneration: ports.textGeneration })

  fastify.get<{
    Params: { id: string; num: string }
    Querystring: { model?: string; provider?: string; quizLength?: string }
  }>(
    '/api/books/:id/chapters/:num/quiz',
    { schema: { params: bookChapterSchema } },
    req => getChapterQuiz({
      bookId: req.params.id,
      chapterNum: parseInt(req.params.num),
      model: req.query.model,
      provider: req.query.provider,
      quizLength: req.query.quizLength ? parseInt(req.query.quizLength) : undefined,
    }),
  )

  fastify.post<{ Params: { id: string; num: string }; Body: unknown }>(
    '/api/books/:id/chapters/:num/feedback',
    { schema: { params: bookChapterSchema } },
    req => submitFeedback({
      bookId: req.params.id,
      chapter: parseInt(req.params.num),
      ...parseBody(FeedbackBodySchema, req.body),
    }),
  )

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/final-quiz',
    { schema: { params: bookIdSchema } },
    req => generateFinalQuiz({ bookId: req.params.id, ...parseBody(FinalQuizBodySchema, req.body) }),
  )
}
