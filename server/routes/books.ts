import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import * as store from '../services/book-store.js'
import {
  BookStatusSchema,
} from '@shared/domain.js'
import { bookIdSchema, bookChapterSchema } from '../http/route-params.js'
import { validateChapterNum } from '../domain/chapter-range.js'

export async function bookRoutes(fastify: FastifyInstance) {
  // --- MCP CRUD routes ---

  fastify.post<{ Body: unknown }>('/api/books/create-skeleton', async (request, _reply) => {
    const body = z.object({
      title: z.string().min(1),
      prompt: z.string().min(1),
      totalChapters: z.number().int().min(1).max(100),
      subtitle: z.string().optional(),
    }).parse(request.body)

    const bookId = randomUUID().slice(0, 12)
    const now = new Date().toISOString()
    await store.saveBook({
      id: bookId,
      title: body.title,
      subtitle: body.subtitle,
      prompt: body.prompt,
      status: 'generating',
      totalChapters: body.totalChapters,
      generatedUpTo: 0,
      createdAt: now,
      updatedAt: now,
      tags: [],
      audioGeneratedChapters: [],
    })
    return { bookId, title: body.title }
  })

  fastify.put<{ Params: { id: string; num: string }; Body: unknown }>(
    '/api/books/:id/chapters/:num/content',
    { schema: { params: bookChapterSchema } },
    async (request, _reply) => {
      const body = z.object({ content: z.string().min(1) }).parse(request.body)
      const chapterNum = parseInt(request.params.num)
      await validateChapterNum(request.params.id, chapterNum)
      await store.saveChapter(request.params.id, chapterNum, body.content)
      return { ok: true }
    },
  )

  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/meta',
    { schema: { params: bookIdSchema } },
    async (request, _reply) => {
      const body = z.object({
        status: BookStatusSchema.optional(),
        generatedUpTo: z.number().int().min(0).optional(),
        title: z.string().min(1).optional(),
        subtitle: z.string().optional(),
      }).parse(request.body)

      const meta = await store.getBook(request.params.id)
      if (body.status !== undefined) meta.status = body.status
      if (body.generatedUpTo !== undefined) meta.generatedUpTo = body.generatedUpTo
      if (body.title !== undefined) meta.title = body.title
      if (body.subtitle !== undefined) meta.subtitle = body.subtitle
      meta.updatedAt = new Date().toISOString()
      await store.saveBook(meta)
      return { ok: true }
    },
  )

  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/brief',
    { schema: { params: bookIdSchema } },
    async (request, _reply) => {
      const body = z.object({ content: z.string().min(1) }).parse(request.body)
      await store.saveBrief(request.params.id, body.content)
      return { ok: true }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/brief',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const content = await store.getBrief(request.params.id)
      return { content }
    },
  )

  fastify.put<{ Params: { id: string; num: string }; Body: unknown }>(
    '/api/books/:id/summaries/:num',
    { schema: { params: bookChapterSchema } },
    async (request, _reply) => {
      const body = z.object({
        summary: z.string().min(1),
        keyPoints: z.array(z.string()),
      }).parse(request.body)
      const chapterNum = parseInt(request.params.num)
      await validateChapterNum(request.params.id, chapterNum)
      await store.saveSummary(request.params.id, chapterNum, body)
      return { ok: true }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/summaries',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const summaries = await store.getAllSummaries(request.params.id)
      return { summaries }
    },
  )

  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/toc',
    { schema: { params: bookIdSchema } },
    async (request, _reply) => {
      const body = z.object({
        chapters: z.array(z.object({
          title: z.string(),
          description: z.string(),
        })),
      }).parse(request.body)
      const meta = await store.getBook(request.params.id)
      meta.totalChapters = body.chapters.length
      meta.updatedAt = new Date().toISOString()
      await store.saveBook(meta)
      await store.saveToc(request.params.id, { chapters: body.chapters })
      return { ok: true }
    },
  )

  const bookRefSchema = {
    type: 'object' as const,
    properties: {
      id: bookIdSchema.properties.id,
      name: { type: 'string' as const, pattern: '^[a-zA-Z0-9-]{1,100}$' },
    },
    required: ['id', 'name'] as const,
  }

  fastify.put<{ Params: { id: string; name: string }; Body: unknown }>(
    '/api/books/:id/references/:name',
    { schema: { params: bookRefSchema } },
    async (request, _reply) => {
      const body = z.object({ content: z.string().min(1) }).parse(request.body)
      await store.saveReference(request.params.id, request.params.name, body.content)
      return { ok: true }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/references',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const references = await store.listReferences(request.params.id)
      return { references }
    },
  )

  fastify.get<{ Params: { id: string; name: string } }>(
    '/api/books/:id/references/:name',
    { schema: { params: bookRefSchema } },
    async (request) => {
      const content = await store.getReference(request.params.id, request.params.name)
      return { content }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/feedback',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const feedback = await store.getAllFeedback(request.params.id)
      return { feedback }
    },
  )

  fastify.put<{ Params: { id: string; num: string }; Body: unknown }>(
    '/api/books/:id/quiz/:num',
    { schema: { params: bookChapterSchema } },
    async (request, _reply) => {
      const body = z.object({
        questions: z.array(z.object({
          question: z.string(),
          options: z.array(z.string()).length(4),
          correctIndex: z.number().int().min(0).max(3),
        })),
      }).parse(request.body)
      const chapterNum = parseInt(request.params.num)
      await validateChapterNum(request.params.id, chapterNum)
      await store.saveQuiz(request.params.id, chapterNum, body)
      return { ok: true }
    },
  )
}
