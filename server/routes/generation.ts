import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  CreateBookBodySchema,
  GenerateNextBodySchema,
  ReviseTocBodySchema,
  StartBookBodySchema,
} from '@shared/contracts.js'
import type { CreateBookEvent, GenerateChapterEvent, ReviseTocEvent, StartBookEvent } from '@shared/events.js'
import { bookIdSchema, bookChapterSchema } from '../http/route-params.js'
import { parseBody } from '../http/parse.js'
import { createCreateBook } from '../services/create-book.js'
import { createReviseToc } from '../services/revise-toc.js'
import { createStartBook } from '../services/start-book.js'
import { createGenerateNextChapter } from '../services/generate-next-chapter.js'
import type { ChapterGenerationStream } from '../services/chapter-generation-stream.js'
import { createGenerateAllChapters } from '../services/generate-all-chapters.js'
import type { BackgroundTasks } from '../ports/background-tasks.js'
import type { BookMeta } from '@shared/domain.js'
import type { Ports, SharedServices } from '../composition-root.js'

const SSE_HEADERS = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } as const

/** Opens the SSE response and returns a typed `send` for one-shot streams (create/revise/start). */
function openSseStream<E>(reply: FastifyReply): (event: E) => void {
  reply.raw.writeHead(200, SSE_HEADERS)
  return (event) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
}

/** Null when neither a single-chapter nor a generate-all run is already active for this book. */
function singleChapterConflict(chapterStream: ChapterGenerationStream, backgroundTasks: BackgroundTasks, bookId: string): { error: string } | null {
  if (chapterStream.isGenerating(bookId)) return { error: 'Generation already in progress for this book' }
  if (backgroundTasks.findActive(bookId, 'generate-all')) return { error: 'Generate-all is running for this book' }
  return null
}

/** Null when the book is in toc_review; otherwise the 409 body every toc_review guard here sends. */
function tocReviewConflict(book: BookMeta, action: string) {
  if (book.status === 'toc_review') return null
  return { error: 'Invalid status', message: `Book must be in 'toc_review' status to ${action}; currently '${book.status}'`, currentStatus: book.status }
}

/** Opens the SSE response and forwards the hub's events for one book until a terminal event, or the client disconnects. */
function pipeHubToSse(reply: FastifyReply, hub: ChapterGenerationStream, bookId: string, sendBuffered: boolean): void {
  reply.raw.writeHead(200, SSE_HEADERS)

  let ended = false
  const unsubscribe = hub.subscribe(bookId, (event: GenerateChapterEvent) => {
    if (ended) return
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    if (event.type === 'done' || event.type === 'error') {
      ended = true
      reply.raw.end()
    }
  }, sendBuffered)

  // Listen on the RESPONSE, never on the request. See issue #50. From Node
  // 16 onward an IncomingMessage emits `close` once its own stream is
  // finished, not only when the peer disconnects, and for a POST whose body
  // Fastify has already read and parsed that is immediately. Listening
  // there unsubscribed and ended the reply before generation produced its
  // first chunk, so the client received a 200 with an empty body while the
  // chapter generated and saved perfectly well behind it.
  //
  // A ServerResponse emits `close` when the response finishes or the
  // connection is torn down early, which is the question actually being
  // asked here. On a normal finish `ended` is already true and unsubscribing
  // is simply the cleanup that was always wanted; on a real disconnect the
  // subscriber is dropped and the reply closed, exactly as before.
  reply.raw.on('close', () => {
    unsubscribe()
    if (!ended) { ended = true; reply.raw.end() }
  })
}

export async function generationRoutes(fastify: FastifyInstance, { ports, services }: { ports: Ports; services: SharedServices }) {
  const generateNextChapter = createGenerateNextChapter({ ai: ports.textGeneration, books: ports.bookRepository, clock: ports.clock })
  const chapterStream = services.chapterGenerationStream

  const createBook = createCreateBook({ ai: ports.textGeneration, books: ports.bookRepository, clock: ports.clock })
  const reviseToc = createReviseToc({ ai: ports.textGeneration, books: ports.bookRepository, clock: ports.clock })
  const startBook = createStartBook({ ai: ports.textGeneration, books: ports.bookRepository, clock: ports.clock })
  // journal is passed here, not only in the resume pass that rebuilds this
  // service at boot. Without it the checkpoint calls inside the generate-all
  // loop would be unreachable in production, which is worse than never
  // having written them, and an interrupted run would resume with no record
  // of how far it had got. The checkpoint is still advisory, resume always
  // recomputes its start point from meta.generatedUpTo on disk.
  const generateAllChapters = createGenerateAllChapters({ backgroundTasks: ports.backgroundTasks, chapterStream, generateNextChapter, journal: ports.jobJournal })

  // --- Single-chapter generation (next / regenerate), backed by the shared hub ---

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/generate-next',
    { schema: { params: bookIdSchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    (request, reply) => {
      const body = parseBody(GenerateNextBodySchema, request.body)
      const bookId = request.params.id
      const conflict = singleChapterConflict(chapterStream, ports.backgroundTasks, bookId)
      if (conflict) return reply.status(409).send(conflict)
      chapterStream.startGeneration(bookId, body)
      pipeHubToSse(reply, chapterStream, bookId, false)
    },
  )

  fastify.post<{ Params: { id: string; num: string }; Body: unknown }>(
    '/api/books/:id/chapters/:num/regenerate',
    { schema: { params: bookChapterSchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parseBody(GenerateNextBodySchema, request.body)
      const bookId = request.params.id
      const chapterNum = parseInt(request.params.num)
      const meta = await ports.bookRepository.getBook(bookId)
      if (chapterNum < 1 || chapterNum > meta.totalChapters) {
        return reply.status(400).send({ error: `Chapter ${chapterNum} out of range (1-${meta.totalChapters})` })
      }
      if (chapterNum > meta.generatedUpTo) {
        return reply.status(400).send({ error: `Chapter ${chapterNum} has not been generated yet` })
      }
      const conflict = singleChapterConflict(chapterStream, ports.backgroundTasks, bookId)
      if (conflict) return reply.status(409).send(conflict)
      chapterStream.startGeneration(bookId, { ...body, targetChapterNum: chapterNum })
      pipeHubToSse(reply, chapterStream, bookId, false)
    },
  )

  fastify.get<{ Params: { id: string } }>('/api/books/:id/generation-status', { schema: { params: bookIdSchema } }, async (request) => {
    return chapterStream.getStatus(request.params.id)
  })

  fastify.get<{ Params: { id: string } }>('/api/books/:id/generation-stream', { schema: { params: bookIdSchema } }, async (request, reply) => {
    const bookId = request.params.id
    const status = chapterStream.getStatus(bookId)

    if (!status.active) {
      return reply.status(404).send({ error: 'No active generation for this book' })
    }

    pipeHubToSse(reply, chapterStream, bookId, true)
  })

  // --- Create book (TOC generation) ---

  fastify.post<{ Body: unknown }>('/api/books', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parseBody(CreateBookBodySchema, request.body)
    const bookId = randomUUID().slice(0, 12)
    const send = openSseStream<CreateBookEvent>(reply)
    await createBook(bookId, body, send)
    reply.raw.end()
  })

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/toc/revise',
    { schema: { params: bookIdSchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parseBody(ReviseTocBodySchema, request.body)
      const bookId = request.params.id
      const book = await ports.bookRepository.getBook(bookId)
      const statusConflict = tocReviewConflict(book, 'revise')
      if (statusConflict) return reply.status(409).send(statusConflict)

      const currentToc = await ports.bookRepository.getToc(bookId)
      if (currentToc.chapters.length === 0) {
        return reply.status(400).send({ error: 'No existing TOC to revise' })
      }

      const send = openSseStream<ReviseTocEvent>(reply)
      await reviseToc(bookId, book, currentToc, body, send)
      reply.raw.end()
    },
  )

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/start',
    { schema: { params: bookIdSchema }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parseBody(StartBookBodySchema, request.body)
      const bookId = request.params.id
      const book = await ports.bookRepository.getBook(bookId)
      const statusConflict = tocReviewConflict(book, 'start')
      if (statusConflict) return reply.status(409).send(statusConflict)
      const send = openSseStream<StartBookEvent>(reply)
      await startBook(bookId, book, body, send)
      reply.raw.end()
    },
  )

  // --- Generate All ---

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/generate-all',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const body = parseBody(GenerateNextBodySchema, request.body)
      const bookId = request.params.id
      const meta = await ports.bookRepository.getBook(bookId)
      if (meta.generatedUpTo >= meta.totalChapters) {
        return reply.status(400).send({ error: 'All chapters already generated' })
      }
      if (ports.backgroundTasks.findActive(bookId, 'generate-all')) {
        return reply.status(409).send({ error: 'Generate-all already in progress for this book' })
      }
      if (chapterStream.isGenerating(bookId)) {
        return reply.status(409).send({ error: 'Single chapter generation in progress — wait for it to finish' })
      }

      return generateAllChapters(bookId, meta, body)
    },
  )
}
