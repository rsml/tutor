import type { FastifyInstance } from 'fastify'
import { ImportEpubBodySchema, ImportEpubConfirmBodySchema } from '@shared/contracts.js'
import { parseBody } from '../http/parse.js'
import { IMPORT_BODY_LIMIT_BYTES } from '../constants.js'
import { STATUS_BAD_REQUEST, STATUS_INTERNAL_SERVER_ERROR } from '../http/status.js'
import type { Ports } from '../composition-root.js'
import { createImportBook } from '../services/import-book.js'

export async function importRoutes(fastify: FastifyInstance, opts: { ports: Ports }) {
  const { previewEpub, importEpub } = createImportBook({
    epubImport: opts.ports.epubImport,
    bookRepository: opts.ports.bookRepository,
    artifactStore: opts.ports.artifactStore,
  })

  // POST /api/books/import/preview
  fastify.post('/api/books/import/preview', { bodyLimit: IMPORT_BODY_LIMIT_BYTES }, async (request, reply) => {
    const body = parseBody(ImportEpubBodySchema, request.body)
    const buffer = Buffer.from(body.base64, 'base64')

    // previewEpub rejects with a plain Error for a malformed or unreadable
    // EPUB (see the EpubImport port). That is a 400 the client should show
    // verbatim, not the generic 500 the global error handler would answer
    // with for an error carrying no statusCode or ENOENT code, so it is
    // still handled locally here rather than left to propagate.
    try {
      const preview = await previewEpub(buffer)
      return reply.send(preview)
    } catch (err) {
      if (err instanceof Error) {
        return reply.status(STATUS_BAD_REQUEST).send({ error: err.message })
      }
      return reply.status(STATUS_INTERNAL_SERVER_ERROR).send({ error: 'Failed to preview EPUB' })
    }
  })

  // POST /api/books/import/confirm
  fastify.post('/api/books/import/confirm', { bodyLimit: IMPORT_BODY_LIMIT_BYTES }, async (request, reply) => {
    const body = parseBody(ImportEpubConfirmBodySchema, request.body)
    const buffer = Buffer.from(body.base64, 'base64')

    try {
      const book = await importEpub(buffer, {
        tags: body.tags,
        series: body.series,
        seriesOrder: body.seriesOrder,
      })
      return reply.send({ book })
    } catch (err) {
      if (err instanceof Error) {
        return reply.status(STATUS_BAD_REQUEST).send({ error: err.message })
      }
      return reply.status(STATUS_INTERNAL_SERVER_ERROR).send({ error: 'Failed to import EPUB' })
    }
  })
}
