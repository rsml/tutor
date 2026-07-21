import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import * as store from '../services/book-store.js'
import * as genManager from '../services/generation-manager.js'
import { PatchBookBodySchema, RatingBodySchema } from '@shared/contracts.js'
import { SEARCH_SNIPPET_RADIUS } from '../constants.js'
import { bookIdSchema } from '../http/route-params.js'
import type { Ports } from '../composition-root.js'

export async function libraryRoutes(fastify: FastifyInstance, _opts: { ports: Ports }) {
  fastify.get('/api/books', async () => {
    let books: Awaited<ReturnType<typeof store.listBooks>>
    try {
      books = await store.listBooks()
    } catch (err) {
      console.error('[GET /api/books] listBooks() failed:', err)
      books = []
    }
    const augmented = await Promise.all(books.map(async b => {
      try {
        return {
          ...b,
          hasCover: await store.hasCover(b.id),
          showTitleOnCover: (b as Record<string, unknown>).showTitleOnCover ?? false,
          coverUpdatedAt: (await store.getCoverMtime(b.id))?.toISOString() ?? null,
          chaptersRead: await store.getChaptersRead(b.id),
          // m4b presence is the source of truth — see crash recovery comment in book-store.ts.
          hasAudiobook: store.audiobookExists(b.id),
        }
      } catch (err) {
        console.error(`[GET /api/books] Failed to augment book "${b.id}":`, err)
        return {
          ...b,
          hasCover: false,
          showTitleOnCover: false,
          coverUpdatedAt: null,
          chaptersRead: 0,
          hasAudiobook: false,
        }
      }
    }))
    return augmented
  })

  // --- Search ---

  fastify.get<{ Querystring: { q?: string; full?: string } }>(
    '/api/books/search',
    async (request) => {
      const query = (request.query.q ?? '').trim().toLowerCase()
      if (!query) return { results: [] }

      const isFull = request.query.full === 'true'
      const books = await store.listBooks()

      type Match = { type: 'title' | 'toc' | 'chapter'; chapter?: number; snippet: string }
      const results: Array<{ bookId: string; matches: Match[] }> = []

      for (const book of books) {
        const matches: Match[] = []

        // Always search title + subtitle
        if (book.title.toLowerCase().includes(query)) {
          matches.push({ type: 'title', snippet: book.title })
        }
        if (book.subtitle && book.subtitle.toLowerCase().includes(query)) {
          matches.push({ type: 'title', snippet: book.subtitle })
        }

        if (isFull) {
          // Search TOC chapter titles and descriptions
          try {
            const toc = await store.getToc(book.id)
            for (let i = 0; i < toc.chapters.length; i++) {
              const ch = toc.chapters[i]
              if (ch.title.toLowerCase().includes(query) || ch.description.toLowerCase().includes(query)) {
                matches.push({
                  type: 'toc',
                  chapter: i + 1,
                  snippet: `${ch.title} — ${ch.description}`,
                })
              }
            }
          } catch {
            // No TOC available, skip
          }

          // Search chapter markdown content
          try {
            const toc = await store.getToc(book.id)
            for (let i = 0; i < toc.chapters.length; i++) {
              try {
                const content = await store.getChapter(book.id, i + 1)
                const lowerContent = content.toLowerCase()
                const idx = lowerContent.indexOf(query)
                if (idx !== -1) {
                  // Extract a snippet around the match
                  const start = Math.max(0, idx - SEARCH_SNIPPET_RADIUS)
                  const end = Math.min(content.length, idx + query.length + SEARCH_SNIPPET_RADIUS)
                  let snippet = content.slice(start, end).replace(/\n/g, ' ')
                  if (start > 0) snippet = '...' + snippet
                  if (end < content.length) snippet = snippet + '...'
                  matches.push({
                    type: 'chapter',
                    chapter: i + 1,
                    snippet,
                  })
                }
              } catch {
                // Chapter file not available, skip
              }
            }
          } catch {
            // No TOC, can't enumerate chapters
          }
        }

        if (matches.length > 0) {
          results.push({ bookId: book.id, matches })
        }
      }

      return { results }
    },
  )

  fastify.get<{ Params: { id: string } }>('/api/books/:id', { schema: { params: bookIdSchema } }, async (request) => {
    const meta = await store.getBook(request.params.id)
    const generation = genManager.getStatus(request.params.id)
    return { ...meta, generation }
  })

  fastify.get<{ Params: { id: string } }>('/api/books/:id/toc', { schema: { params: bookIdSchema } }, async (request) => {
    return store.getToc(request.params.id)
  })

  fastify.patch<{ Params: { id: string }; Body: unknown }>('/api/books/:id', { schema: { params: bookIdSchema } }, async (request, reply) => {
    try {
      const body = PatchBookBodySchema.parse(request.body)
      const meta = await store.getBook(request.params.id)
      if (body.title !== undefined) meta.title = body.title
      if (body.subtitle !== undefined) meta.subtitle = body.subtitle
      if (body.showTitleOnCover !== undefined) (meta as Record<string, unknown>).showTitleOnCover = body.showTitleOnCover
      if (body.tags !== undefined) {
        ;(meta as Record<string, unknown>).tags = body.tags
          .map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
          .filter(Boolean)
      }
      if (body.series !== undefined) (meta as Record<string, unknown>).series = body.series
      if (body.seriesOrder !== undefined) (meta as Record<string, unknown>).seriesOrder = body.seriesOrder
      if (body.sortOrder !== undefined) (meta as Record<string, unknown>).sortOrder = body.sortOrder
      meta.updatedAt = new Date().toISOString()
      await store.saveBook(meta)
      return { ok: true }
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }
  })

  fastify.delete<{ Params: { id: string } }>('/api/books/:id', { schema: { params: bookIdSchema } }, async (request) => {
    await store.deleteBook(request.params.id)
    return { ok: true }
  })

  fastify.post<{ Params: { id: string } }>(
    '/api/books/:id/reset',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const meta = await store.getBook(request.params.id)
      if (meta.status === 'generating' || meta.status === 'generating_toc') {
        return reply.code(409).send({ error: 'Cannot reset while generating' })
      }
      await store.resetBook(request.params.id)
      return { ok: true }
    },
  )

  fastify.put<{
    Params: { id: string }
    Body: unknown
  }>('/api/books/:id/rating', { schema: { params: bookIdSchema } }, async (request, reply) => {
    try {
      const body = RatingBodySchema.parse(request.body)
      const meta = await store.getBook(request.params.id)
      if (body.rating === 0) {
        delete meta.rating
      } else {
        meta.rating = body.rating
      }
      if (body.finalQuizScore !== undefined) {
        meta.finalQuizScore = body.finalQuizScore
        meta.finalQuizTotal = body.finalQuizTotal
        meta.status = 'complete'
      }
      meta.updatedAt = new Date().toISOString()
      await store.saveBook(meta)
      return { ok: true }
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }
  })

  // --- Skill Progress ---

  fastify.get('/api/progress/skills', async () => {
    return store.getSkillProgress()
  })
}
