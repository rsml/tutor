import type { FastifyInstance } from 'fastify'
import { bookIdSchema } from '../http/route-params.js'
import { STATUS_BAD_REQUEST, STATUS_CONFLICT, STATUS_NOT_FOUND } from '../http/status.js'
import type { Ports, SharedServices } from '../composition-root.js'
import { createExportEpub, getEpubFile } from '../services/export-epub.js'

export async function epubRoutes(fastify: FastifyInstance, opts: { ports: Ports; services: SharedServices }) {
  const { ports } = opts
  const exportEpub = createExportEpub({
    bookRepository: ports.bookRepository,
    artifactStore: ports.artifactStore,
    backgroundTasks: ports.backgroundTasks,
    diagramRenderer: ports.diagramRenderer,
    epubExport: ports.epubExport,
  })

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/export-epub',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const result = await exportEpub(request.params.id)

      switch (result.outcome) {
        case 'not-complete':
          return reply.status(STATUS_BAD_REQUEST).send({ error: 'Book is not complete — all chapters must be generated first' })
        case 'cached':
          return { cached: true, path: result.path }
        case 'in-progress':
          return reply.status(STATUS_CONFLICT).send({ error: 'EPUB export already in progress' })
        case 'started':
          return { taskId: result.taskId }
      }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/export-epub',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const file = await getEpubFile(request.params.id, ports)
      if (!file) {
        return reply.status(STATUS_NOT_FOUND).send({ error: 'No EPUB file — generate it first' })
      }

      reply.header('Content-Type', 'application/epub+zip')
      reply.header('Content-Disposition', `attachment; filename="${file.filename}"`)
      return reply.send(file.data)
    },
  )
}
