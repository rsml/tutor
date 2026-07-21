import type { FastifyInstance } from 'fastify'
import { PatchBookBodySchema, RatingBodySchema } from '@shared/contracts.js'
import { bookIdSchema } from '../http/route-params.js'
import { parseBody } from '../http/parse.js'
import * as genManager from '../services/generation-manager.js'
import { createListLibrary } from '../services/list-library.js'
import { createSearchLibrary } from '../services/search-library.js'
import { createGetBookDetail, createGetBookToc } from '../services/get-book.js'
import { createUpdateBookDetails } from '../services/update-book-details.js'
import { createDeleteBook } from '../services/delete-book.js'
import { createResetBook } from '../services/reset-book.js'
import { createRateBook } from '../services/rate-book.js'
import { createGetSkillProgress } from '../services/get-skill-progress.js'
import type { Ports } from '../composition-root.js'

export async function libraryRoutes(fastify: FastifyInstance, { ports }: { ports: Ports }) {
  const listLibrary = createListLibrary({ books: ports.bookRepository, artifacts: ports.artifactStore })
  const searchLibrary = createSearchLibrary({ books: ports.bookRepository })
  const getBookDetail = createGetBookDetail({ books: ports.bookRepository, getGenerationStatus: genManager.getStatus })
  const getBookToc = createGetBookToc({ books: ports.bookRepository })
  const updateBookDetails = createUpdateBookDetails({ books: ports.bookRepository, clock: ports.clock })
  const deleteBook = createDeleteBook({ books: ports.bookRepository, artifacts: ports.artifactStore })
  const resetBook = createResetBook({ books: ports.bookRepository })
  const rateBook = createRateBook({ books: ports.bookRepository, clock: ports.clock })
  const getSkillProgress = createGetSkillProgress({ books: ports.bookRepository })

  fastify.get('/api/books', () => listLibrary())

  fastify.get<{ Querystring: { q?: string; full?: string } }>('/api/books/search', async (request) => {
    return searchLibrary(request.query.q ?? '', { full: request.query.full === 'true' })
  })

  fastify.get<{ Params: { id: string } }>('/api/books/:id', { schema: { params: bookIdSchema } }, async (request) => {
    return getBookDetail(request.params.id)
  })

  fastify.get<{ Params: { id: string } }>('/api/books/:id/toc', { schema: { params: bookIdSchema } }, async (request) => {
    return getBookToc(request.params.id)
  })

  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const body = parseBody(PatchBookBodySchema, request.body)
      await updateBookDetails(request.params.id, body)
      return { ok: true }
    },
  )

  fastify.delete<{ Params: { id: string } }>('/api/books/:id', { schema: { params: bookIdSchema } }, async (request) => {
    await deleteBook(request.params.id)
    return { ok: true }
  })

  fastify.post<{ Params: { id: string } }>(
    '/api/books/:id/reset',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const result = await resetBook(request.params.id)
      if (!result.ok) return reply.code(409).send({ error: 'Cannot reset while generating' })
      return { ok: true }
    },
  )

  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/rating',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const body = parseBody(RatingBodySchema, request.body)
      await rateBook(request.params.id, body)
      return { ok: true }
    },
  )

  // --- Skill Progress ---

  fastify.get('/api/progress/skills', () => getSkillProgress())
}
