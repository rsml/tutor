import type { FastifyInstance } from 'fastify'
import { readFile } from 'node:fs/promises'
import { ZodError, z } from 'zod'
import { generateObject } from 'ai'
import * as store from '../services/book-store.js'
import { createModelClient } from '../services/model-client.js'
import * as taskManager from '../services/task-manager.js'
import { generateImageWithFallback } from '../services/image-generation.js'
import { GenerateCoverBodySchema, UploadCoverBodySchema, SuggestCoverPromptBodySchema } from '@shared/contracts.js'
import { DEFAULT_PROVIDER } from '@shared/provider.js'

const bookIdSchema = {
  type: 'object' as const,
  properties: { id: { type: 'string' as const, pattern: '^[a-z0-9-]{1,50}$' } },
  required: ['id'] as const,
}

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
}

export async function coverRoutes(fastify: FastifyInstance) {
  // Generate cover via AI
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/cover/generate',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      let body: { prompt: string; provider: string; model: string }
      try {
        body = GenerateCoverBodySchema.parse(request.body)
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: err.issues })
        }
        throw err
      }

      const bookId = request.params.id
      const meta = await store.getBook(bookId)

      // Check for existing cover generation task
      if (taskManager.getActiveTaskForBook(bookId, 'generate-cover')) {
        return reply.status(409).send({ error: 'Cover generation already in progress' })
      }

      const task = taskManager.createTask('generate-cover', bookId, meta.title, 1)

      // Fire-and-forget — run in background
      ;(async () => {
        try {
          const image = await generateImageWithFallback({
            provider: body.provider,
            preferredModel: body.model,
            prompt: body.prompt,
            signal: task.abortController.signal,
          })

          // Safety guard: don't overwrite a cover that was set after this task started
          const existingMtime = await store.getCoverMtime(bookId)
          if (existingMtime && existingMtime > new Date(task.createdAt)) {
            taskManager.completeTask(task.id, { skipped: true })
            return
          }

          await store.saveCover(bookId, image.data, image.mediaType)
          taskManager.completeTask(task.id)
        } catch (err) {
          if (task.abortController.signal.aborted) {
            return // Already cancelled
          }
          taskManager.failTask(task.id, err instanceof Error ? err.message : 'Cover generation failed')
        }
      })()

      return { taskId: task.id }
    },
  )

  // Upload cover
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/cover/upload',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      let body: { base64: string; mediaType: string }
      try {
        body = UploadCoverBodySchema.parse(request.body)
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: err.issues })
        }
        throw err
      }

      // Verify book exists
      await store.getBook(request.params.id)

      const data = Buffer.from(body.base64, 'base64')
      await store.saveCover(request.params.id, data, body.mediaType)
      return { ok: true }
    },
  )

  // Serve cover image
  fastify.get<{ Params: { id: string } }>(
    '/api/books/:id/cover',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      const coverPath = await store.getCoverPath(request.params.id)
      if (!coverPath) {
        return reply.status(404).send({ error: 'No cover image' })
      }
      const ext = '.' + coverPath.split('.').pop()
      const contentType = MIME_MAP[ext] ?? 'image/png'
      const data = await readFile(coverPath)
      reply.header('Content-Type', contentType)
      reply.header('Cache-Control', 'public, max-age=3600')
      return reply.send(data)
    },
  )

  // Suggest cover prompt via AI
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/cover/suggest-prompt',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      let body: z.infer<typeof SuggestCoverPromptBodySchema>
      try {
        body = SuggestCoverPromptBodySchema.parse(request.body)
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: err.issues })
        }
        throw err
      }

      const bookId = request.params.id
      const meta = await store.getBook(bookId)
      const modelClient = createModelClient(body.provider ?? DEFAULT_PROVIDER, body.model)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000)

      try {
        const result = await generateObject({
          model: modelClient,
          abortSignal: controller.signal,
          schema: z.object({ prompt: z.string() }),
          prompt: `Output a prompt in this EXACT format (fill in the bracketed parts creatively based on this theme topic, choosing a unique visual style, color palette, and background concept):

          Generate a minimal, tasteful design

It is an art piece vaguely suggestive of or complementary of: ${meta.prompt}

very minimal abstract art

2-3 colors

lots of negative space

high resolution

--stylize 1 --v 6 --style raw --ar 21:34 --weird 0 --no photo --no realistic --no objects in center

top and bottom framing elements, large empty center

Important:
- Prefer simple abstract symbols over literal scenes
- Limit visual elements to 1–2 shapes or motifs
- Avoid complex textures, lighting, or realism
- Emphasize strong graphic design and negative space
- Keep the prompt under 450 characters`,
        })

        return result.object
      } finally {
        clearTimeout(timer)
      }
    },
  )

  // Delete cover
  fastify.delete<{ Params: { id: string } }>(
    '/api/books/:id/cover',
    { schema: { params: bookIdSchema } },
    async (request) => {
      await store.deleteCover(request.params.id)
      return { ok: true }
    },
  )
}
