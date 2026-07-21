import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { ImportEpubBodySchema, ImportEpubConfirmBodySchema } from '@shared/contracts.js'
import { previewEpub, importEpub } from '../services/epub-importer.js'
import { IMPORT_BODY_LIMIT_BYTES } from '../constants.js'
import { STATUS_BAD_REQUEST, STATUS_INTERNAL_SERVER_ERROR } from '../http/status.js'

export async function importRoutes(fastify: FastifyInstance) {
  // POST /api/books/import/preview
  fastify.post('/api/books/import/preview', { bodyLimit: IMPORT_BODY_LIMIT_BYTES }, async (request, reply) => {
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
        return reply.status(STATUS_BAD_REQUEST).send({ error: err.message })
      }
      return reply.status(STATUS_INTERNAL_SERVER_ERROR).send({ error: 'Failed to preview EPUB' })
    }
  })

  // POST /api/books/import/confirm
  fastify.post('/api/books/import/confirm', { bodyLimit: IMPORT_BODY_LIMIT_BYTES }, async (request, reply) => {
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
        return reply.status(STATUS_BAD_REQUEST).send({ error: err.message })
      }
      return reply.status(STATUS_INTERNAL_SERVER_ERROR).send({ error: 'Failed to import EPUB' })
    }
  })
}
