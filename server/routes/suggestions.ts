import type { FastifyInstance } from 'fastify'
import { SuggestBookBodySchema, SuggestDetailsBodySchema, FinalQuizBodySchema } from '@shared/contracts.js'
import { parseBody } from '../http/parse.js'
import { bookIdSchema } from '../http/route-params.js'
import { createSuggestNextBook } from '../services/suggest-next-book.js'
import { createSuggestBookDetails } from '../services/suggest-book-details.js'
import { createSuggestProfileUpdates } from '../services/suggest-profile-updates.js'
import type { Ports } from '../composition-root.js'

/**
 * Every AI-driven suggestion route: what to learn next, what a new book's
 * details should say, and how a just-finished book should update the
 * learning profile. Wiring and request parsing only — the real work lives
 * in server/services/suggest-next-book.ts, suggest-book-details.ts, and
 * suggest-profile-updates.ts.
 *
 * POST /api/books/:id/profile-suggestions is registered here rather than in
 * assessment.ts, where the mechanical route split originally left it — it
 * suggests profile updates, which belongs with the other suggestion routes.
 */
export async function suggestionRoutes(fastify: FastifyInstance, { ports }: { ports: Ports }) {
  const suggestNextBook = createSuggestNextBook({ books: ports.bookRepository, textGeneration: ports.textGeneration })
  const suggestBookDetails = createSuggestBookDetails({ textGeneration: ports.textGeneration })
  const suggestProfileUpdates = createSuggestProfileUpdates({ books: ports.bookRepository, textGeneration: ports.textGeneration })

  fastify.post<{ Body: unknown }>(
    '/api/books/suggest',
    req => suggestNextBook(parseBody(SuggestBookBodySchema, req.body)),
  )

  fastify.post<{ Body: unknown }>(
    '/api/books/suggest-details',
    req => suggestBookDetails(parseBody(SuggestDetailsBodySchema, req.body)),
  )

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/profile-suggestions',
    { schema: { params: bookIdSchema } },
    req => suggestProfileUpdates({ bookId: req.params.id, ...parseBody(FinalQuizBodySchema, req.body) }),
  )
}
