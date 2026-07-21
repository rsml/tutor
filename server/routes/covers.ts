import type { FastifyInstance } from 'fastify'
import { GenerateCoverBodySchema, UploadCoverBodySchema, SuggestCoverPromptBodySchema } from '@shared/contracts.js'
import { parseBody } from '../http/parse.js'
import { COVER_CACHE_MAX_AGE_S } from '../constants.js'
import { bookIdSchema } from '../http/route-params.js'
import { STATUS_NOT_FOUND, STATUS_CONFLICT } from '../http/status.js'
import type { Ports, SharedServices } from '../composition-root.js'
import { createGenerateCover } from '../services/generate-cover.js'
import { createSuggestCoverPrompt } from '../services/suggest-cover-prompt.js'
import { getCoverFile } from '../services/serve-cover.js'

export async function coverRoutes(fastify: FastifyInstance, opts: { ports: Ports; services: SharedServices }) {
  const { ports } = opts
  const generateCover = createGenerateCover({
    bookRepository: ports.bookRepository,
    artifactStore: ports.artifactStore,
    backgroundTasks: ports.backgroundTasks,
    imageGeneration: ports.imageGeneration,
  })
  const suggestCoverPrompt = createSuggestCoverPrompt({
    bookRepository: ports.bookRepository,
    textGeneration: ports.textGeneration,
  })

  // Generate cover via AI
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/cover/generate',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const body = parseBody(GenerateCoverBodySchema, request.body)
      const result = await generateCover(request.params.id, body)

      if (result.outcome === 'in-progress') {
        return reply.status(STATUS_CONFLICT).send({ error: 'Cover generation already in progress' })
      }
      return { taskId: result.taskId }
    },
  )

  // Upload cover
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/cover/upload',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const body = parseBody(UploadCoverBodySchema, request.body)

      // Verify book exists
      await ports.bookRepository.getBook(request.params.id)

      const data = Buffer.from(body.base64, 'base64')
      await ports.artifactStore.saveCover(request.params.id, data, body.mediaType)
      return { ok: true }
    },
  )

  // Serve cover image
  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/cover',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const file = await getCoverFile(request.params.id, ports.artifactStore)
      if (!file) {
        return reply.status(STATUS_NOT_FOUND).send({ error: 'No cover image' })
      }
      reply.header('Content-Type', file.contentType)
      reply.header('Cache-Control', `public, max-age=${COVER_CACHE_MAX_AGE_S}`)
      return reply.send(file.data)
    },
  )

  // Suggest cover prompt via AI
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/cover/suggest-prompt',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const body = parseBody(SuggestCoverPromptBodySchema, request.body)
      return suggestCoverPrompt({ bookId: request.params.id, provider: body.provider, model: body.model })
    },
  )

  // Delete cover
  fastify.delete<{ Params: { id: string } }>(
    '/api/books/:id/cover',
    { schema: { params: bookIdSchema } },
    async (request) => {
      await ports.artifactStore.deleteCover(request.params.id)
      return { ok: true }
    },
  )
}
