import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import * as store from '../services/book-store.js'
import { ChapterProgressSchema } from '@shared/domain.js'
import { bookChapterSchema } from '../http/route-params.js'
import { validateChapterNum } from '../domain/chapter-range.js'
import type { Ports } from '../composition-root.js'

export async function readingRoutes(fastify: FastifyInstance, _opts: { ports: Ports }) {
  fastify.get<{ Params: { id: string; num: string } }>(
    '/api/books/:id/chapters/:num',
    { schema: { params: bookChapterSchema } },
    async (request) => {
      const chapterNum = parseInt(request.params.num)
      await validateChapterNum(request.params.id, chapterNum)
      const content = await store.getChapter(request.params.id, chapterNum)
      return { content }
    },
  )

  // --- Chapter Progress ---

  fastify.put<{
    Params: { id: string; num: string }
    Body: unknown
  }>(
    '/api/books/:id/progress/:num',
    { schema: { params: bookChapterSchema } },
    async (request, reply) => {
      try {
        const body = ChapterProgressSchema.parse(request.body)
        const chapterNum = parseInt(request.params.num)
        await validateChapterNum(request.params.id, chapterNum)
        await store.saveChapterProgress(request.params.id, chapterNum, body)
        return { ok: true }
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: err.issues })
        }
        throw err
      }
    },
  )
}
