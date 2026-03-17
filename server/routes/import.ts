import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { ImportEpubBodySchema, ImportEpubConfirmBodySchema } from '../schemas.js'
import { previewEpub, importEpub } from '../services/epub-importer.js'

const BODY_LIMIT = 20 * 1024 * 1024 // 20MB to accommodate ~10MB EPUB as base64

export async function importRoutes(fastify: FastifyInstance) {
  // POST /api/books/import/preview
  fastify.post('/api/books/import/preview', { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    try {
      const body = ImportEpubBodySchema.parse(request.body)
      const buffer = Buffer.from(body.base64, 'base64')
      const preview = await previewEpub(buffer)
      return reply.send(preview)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      if (err instanceof Error) {
        return reply.status(400).send({ error: err.message })
      }
      return reply.status(500).send({ error: 'Failed to preview EPUB' })
    }
  })

  // POST /api/books/import/confirm
  fastify.post('/api/books/import/confirm', { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    try {
      const body = ImportEpubConfirmBodySchema.parse(request.body)
      const buffer = Buffer.from(body.base64, 'base64')
      const book = await importEpub(buffer, {
        tags: body.tags,
        series: body.series,
        seriesOrder: body.seriesOrder,
      })
      return reply.send({ book })
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      if (err instanceof Error) {
        return reply.status(400).send({ error: err.message })
      }
      return reply.status(500).send({ error: 'Failed to import EPUB' })
    }
  })
}
