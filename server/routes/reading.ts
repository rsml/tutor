import type { FastifyInstance } from 'fastify'
import { ChapterProgressSchema } from '@shared/domain.js'
import { bookChapterSchema } from '../http/route-params.js'
import { parseBody } from '../http/parse.js'
import { createReadChapter } from '../services/read-chapter.js'
import { createRecordChapterProgress } from '../services/record-chapter-progress.js'
import type { Ports } from '../composition-root.js'

export async function readingRoutes(fastify: FastifyInstance, { ports }: { ports: Ports }) {
  const readChapter = createReadChapter({ books: ports.bookRepository })
  const recordChapterProgress = createRecordChapterProgress({ books: ports.bookRepository })

  fastify.get<{ Params: { id: string; num: string } }>(
    '/api/books/:id/chapters/:num',
    { schema: { params: bookChapterSchema } },
    async (request) => {
      const chapterNum = parseInt(request.params.num)
      const content = await readChapter(request.params.id, chapterNum)
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
    async (request) => {
      const body = parseBody(ChapterProgressSchema, request.body)
      const chapterNum = parseInt(request.params.num)
      await recordChapterProgress(request.params.id, chapterNum, body)
      return { ok: true }
    },
  )
}
