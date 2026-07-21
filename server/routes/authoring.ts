import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { BookStatusSchema } from '@shared/domain.js'
import { bookIdSchema, bookChapterSchema } from '../http/route-params.js'
import { parseBody } from '../http/parse.js'
import { createCreateSkeleton } from '../services/authoring/create-skeleton.js'
import { createSaveChapterContent } from '../services/authoring/chapter-content.js'
import { createUpdateBookMeta } from '../services/authoring/book-meta.js'
import { createSaveBrief, createGetBrief } from '../services/authoring/brief.js'
import { createSaveSummary, createGetAllSummaries } from '../services/authoring/summaries.js'
import { createSaveAuthoringToc } from '../services/authoring/toc.js'
import { createSaveReference, createListReferences, createGetReference } from '../services/authoring/references.js'
import { createGetAllFeedback } from '../services/authoring/feedback.js'
import { createSaveQuiz } from '../services/authoring/quiz.js'
import type { Ports } from '../composition-root.js'
// Body schemas for the eight MCP authoring writes. Kept here rather than in
// shared/contracts.ts, since these are MCP-authoring-only shapes with no
// client-side counterpart to share them with.
const CreateSkeletonBodySchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  totalChapters: z.number().int().min(1).max(100),
  subtitle: z.string().optional(),
})
const ChapterContentBodySchema = z.object({ content: z.string().min(1) })
const BookMetaPatchSchema = z.object({
  status: BookStatusSchema.optional(),
  generatedUpTo: z.number().int().min(0).optional(),
  title: z.string().min(1).optional(),
  subtitle: z.string().optional(),
})
const BriefBodySchema = z.object({ content: z.string().min(1) })
const SummaryBodySchema = z.object({
  summary: z.string().min(1),
  keyPoints: z.array(z.string()),
})
const AuthoringTocBodySchema = z.object({
  chapters: z.array(z.object({ title: z.string(), description: z.string() })),
})
const ReferenceBodySchema = z.object({ content: z.string().min(1) })
const QuizBodySchema = z.object({
  questions: z.array(z.object({
    question: z.string(),
    options: z.array(z.string()).length(4),
    correctIndex: z.number().int().min(0).max(3),
  })),
})

const bookRefSchema = {
  type: 'object' as const,
  properties: {
    id: bookIdSchema.properties.id,
    name: { type: 'string' as const, pattern: '^[a-zA-Z0-9-]{1,100}$' },
  },
  required: ['id', 'name'] as const,
}

// The MCP authoring surface — CRUD routes the MCP server uses to author
// book content directly (skeletons, chapter content, metadata, briefs,
// summaries, TOC, references, feedback, quizzes) rather than through the
// AI generation flow.
export async function authoringRoutes(fastify: FastifyInstance, { ports }: { ports: Ports }) {
  const createSkeleton = createCreateSkeleton({ books: ports.bookRepository, clock: ports.clock })
  const saveChapterContent = createSaveChapterContent({ books: ports.bookRepository })
  const updateBookMeta = createUpdateBookMeta({ books: ports.bookRepository, clock: ports.clock })
  const saveBrief = createSaveBrief({ books: ports.bookRepository })
  const getBrief = createGetBrief({ books: ports.bookRepository })
  const saveSummary = createSaveSummary({ books: ports.bookRepository })
  const getAllSummaries = createGetAllSummaries({ books: ports.bookRepository })
  const saveAuthoringToc = createSaveAuthoringToc({ books: ports.bookRepository, clock: ports.clock })
  const saveReference = createSaveReference({ books: ports.bookRepository })
  const listReferences = createListReferences({ books: ports.bookRepository })
  const getReference = createGetReference({ books: ports.bookRepository })
  const getAllFeedback = createGetAllFeedback({ books: ports.bookRepository })
  const saveQuiz = createSaveQuiz({ books: ports.bookRepository })

  fastify.post<{ Body: unknown }>('/api/books/create-skeleton', async (request) => {
    const body = parseBody(CreateSkeletonBodySchema, request.body)
    return createSkeleton(body)
  })

  fastify.put<{ Params: { id: string; num: string }; Body: unknown }>(
    '/api/books/:id/chapters/:num/content',
    { schema: { params: bookChapterSchema } },
    async (request) => {
      const body = parseBody(ChapterContentBodySchema, request.body)
      const chapterNum = parseInt(request.params.num)
      await saveChapterContent(request.params.id, chapterNum, body.content)
      return { ok: true }
    },
  )

  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/meta',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const body = parseBody(BookMetaPatchSchema, request.body)
      await updateBookMeta(request.params.id, body)
      return { ok: true }
    },
  )

  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/brief',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const body = parseBody(BriefBodySchema, request.body)
      await saveBrief(request.params.id, body.content)
      return { ok: true }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/brief',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const content = await getBrief(request.params.id)
      return { content }
    },
  )

  fastify.put<{ Params: { id: string; num: string }; Body: unknown }>(
    '/api/books/:id/summaries/:num',
    { schema: { params: bookChapterSchema } },
    async (request) => {
      const body = parseBody(SummaryBodySchema, request.body)
      const chapterNum = parseInt(request.params.num)
      await saveSummary(request.params.id, chapterNum, body)
      return { ok: true }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/summaries',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const summaries = await getAllSummaries(request.params.id)
      return { summaries }
    },
  )

  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/toc',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const body = parseBody(AuthoringTocBodySchema, request.body)
      await saveAuthoringToc(request.params.id, body.chapters)
      return { ok: true }
    },
  )

  fastify.put<{ Params: { id: string; name: string }; Body: unknown }>(
    '/api/books/:id/references/:name',
    { schema: { params: bookRefSchema } },
    async (request) => {
      const body = parseBody(ReferenceBodySchema, request.body)
      await saveReference(request.params.id, request.params.name, body.content)
      return { ok: true }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/references',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const references = await listReferences(request.params.id)
      return { references }
    },
  )

  fastify.get<{ Params: { id: string; name: string } }>(
    '/api/books/:id/references/:name',
    { schema: { params: bookRefSchema } },
    async (request) => {
      const content = await getReference(request.params.id, request.params.name)
      return { content }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/feedback',
    { schema: { params: bookIdSchema } },
    async (request) => {
      const feedback = await getAllFeedback(request.params.id)
      return { feedback }
    },
  )

  fastify.put<{ Params: { id: string; num: string }; Body: unknown }>(
    '/api/books/:id/quiz/:num',
    { schema: { params: bookChapterSchema } },
    async (request) => {
      const body = parseBody(QuizBodySchema, request.body)
      const chapterNum = parseInt(request.params.num)
      await saveQuiz(request.params.id, chapterNum, body)
      return { ok: true }
    },
  )
}
