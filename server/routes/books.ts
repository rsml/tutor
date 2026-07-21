import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { streamText, generateObject } from 'ai'
import { z } from 'zod'
import { ZodError } from 'zod'
import * as store from '../services/book-store.js'
import { createModelClient } from '../services/model-client.js'
import * as genManager from '../services/generation-manager.js'
import * as taskManager from '../services/task-manager.js'
import { parseTocFromMarkdown, truncateChapters } from '../services/toc-parser.js'
import {
  BookStatusSchema,
} from '@shared/domain.js'
import {
  CreateBookBodySchema,
  GenerateNextBodySchema,
  ReviseTocBodySchema,
  StartBookBodySchema,
} from '@shared/contracts.js'
import { DEFAULT_PROVIDER } from '@shared/provider.js'
import { MARKDOWN_FORMATTING_RULES } from '../prompts/formatting-rules.js'
import {
  DEFAULT_CHAPTER_COUNT,
  DEFAULT_QUIZ_LENGTH,
  MAX_CHAPTERS,
  TOC_ERROR_SNIPPET_CHARS,
} from '../constants.js'
import { bookIdSchema, bookChapterSchema } from '../http/route-params.js'
import { createTimeout } from '../http/ai-timeout.js'
import { buildProfileContext } from '../domain/profile-context.js'
import { validateChapterNum } from '../domain/chapter-range.js'
import { sanitizeFeedback } from '../domain/sanitize.js'
import { generateQuiz } from '../services/generate-quiz.js'

export async function bookRoutes(fastify: FastifyInstance) {
  async function generateFirstChapterAndQuiz(
    bookId: string,
    send: (data: Record<string, unknown>) => void,
    opts: {
      provider: string
      model: string
      quizProvider: string
      quizModel: string
      quizLength: number
      profileContext: string
      topic: string
      details?: string
    },
  ): Promise<void> {
    // 1. Read book + TOC from store
    const book = await store.getBook(bookId)
    const toc = await store.getToc(bookId)
    const chapters = toc.chapters

    // 2. Skill classification — write skills back to toc.yml
    let tocSkills: { name: string; weight: number }[] = []
    let chapterSkillMap: Array<{ chapterIndex: number; skills: Array<{ skill: string; subskill: string; weight: number }> }> = []
    try {
      const skillTimeout = createTimeout()
      const skillClassification = await generateObject({
        model: createModelClient(opts.provider, opts.model),
        abortSignal: skillTimeout.signal,
        schema: z.object({
          skills: z.array(z.object({
            name: z.string(),
            weight: z.number(),
          })),
          chapters: z.array(z.object({
            chapterIndex: z.number(),
            skills: z.array(z.object({
              skill: z.string(),
              subskill: z.string(),
              weight: z.number(),
            })),
          })),
        }),
        prompt: `You are classifying the learning content of a book's table of contents like a college course curriculum.

Book title: ${book.title}
Topic: ${opts.topic}

Chapters:
${chapters.map((ch, i) => `${i + 1}. ${ch.title} — ${ch.description}`).join('\n')}

Identify 2-5 top-level skills this book teaches (broad disciplines like "Workflow Orchestration", "Distributed Systems", "API Design"). Assign each a weight 1-5 reflecting how central it is to the book.

For each chapter, identify 1-3 sub-skills that fall under the book's top-level skills. Each sub-skill must reference one of the top-level skill names. Assign weights 1-3.

Use consistent, human-readable skill names. Think of skills as what would appear on a course syllabus.`,
      })
      skillTimeout.clear()
      tocSkills = skillClassification.object.skills
      chapterSkillMap = skillClassification.object.chapters
      send({ type: 'skills_classified' })
    } catch {
      // Skill classification failure is non-fatal
    }

    // Persist skills onto the TOC (preserve existing chapters)
    const tocWithSkills = {
      skills: tocSkills.length > 0 ? tocSkills : undefined,
      chapters: chapters.map((ch, i) => ({
        ...ch,
        skills: chapterSkillMap.find(c => c.chapterIndex === i)?.skills ?? undefined,
      })),
    }
    await store.saveToc(bookId, tocWithSkills)

    // 3. Update status: toc_review → generating
    book.status = 'generating'
    book.updatedAt = new Date().toISOString()
    await store.saveBook(book)

    // 4. Stream Chapter 1
    let chapterText = ''
    const ch1Timeout = createTimeout()
    const chapterResult = streamText({
      model: createModelClient(opts.provider, opts.model),
      abortSignal: ch1Timeout.signal,
      system: `You are writing a chapter for a personalized learning book. Write an engaging, clear chapter approximately 1,500 words long.

Use markdown formatting:
- Start with # heading for the chapter title
- Use ## and ### for sections
- Bold and italic for emphasis
- Bullet/numbered lists where appropriate
- Code blocks with language tags where relevant
- > blockquotes for key insights or memorable takeaways
- If you include mermaid diagrams, do NOT add style, classDef, or class directives for colors — the app applies its own theme automatically. ALWAYS wrap node labels in double quotes (e.g., \`A["My Label"]\` not \`A[My Label]\`)

Write in a conversational but knowledgeable tone. Use concrete examples and real-world analogies. Make complex ideas accessible without being condescending.
${opts.profileContext ? `\nReader profile:\n${opts.profileContext}\n` : ''}
${MARKDOWN_FORMATTING_RULES}`,
      prompt: `Book: ${book.title}
Topic: ${opts.topic}${opts.details ? `\nContext: ${opts.details}` : ''}

This is Chapter 1 of ${chapters.length}.
Chapter title: ${chapters[0].title}
Chapter description: ${chapters[0].description}

Write this chapter now.`,
    })
    for await (const chunk of chapterResult.textStream) {
      chapterText += chunk
      send({ type: 'chapter', text: chunk })
    }
    ch1Timeout.clear()

    await store.saveChapter(bookId, 1, chapterText)

    // 5. Quiz (non-fatal)
    try {
      const quiz = await generateQuiz(opts.quizProvider, opts.quizModel, chapterText, opts.quizLength)
      await store.saveQuiz(bookId, 1, quiz)
    } catch (err) {
      console.error(`[quiz-gen] first-chapter quiz failed for ${bookId} (${opts.quizProvider}/${opts.quizModel}):`, err)
    }

    // 6. Finalize
    const meta = await store.getBook(bookId)
    meta.generatedUpTo = 1
    meta.status = 'reading'
    meta.updatedAt = new Date().toISOString()
    await store.saveBook(meta)
  }

  fastify.post<{
    Params: { id: string }
    Body: unknown
  }>('/api/books/:id/generate-next', { schema: { params: bookIdSchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    let body: { model: string; provider?: string; quizModel?: string; quizProvider?: string; quizLength?: number }
    try {
      body = GenerateNextBodySchema.parse(request.body)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }

    const { model, provider, quizModel, quizProvider, quizLength } = body
    const bookId = request.params.id

    if (genManager.isGenerating(bookId)) {
      return reply.status(409).send({ error: 'Generation already in progress for this book' })
    }

    if (taskManager.getActiveTaskForBook(bookId, 'generate-all')) {
      return reply.status(409).send({ error: 'Generate-all is running for this book' })
    }

    genManager.startGeneration(bookId, { model, provider, quizModel, quizProvider, quizLength })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    let ended = false
    const unsubscribe = genManager.subscribe(bookId, (event) => {
      if (ended) return
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      if (event.type === 'done' || event.type === 'error') {
        ended = true
        reply.raw.end()
      }
    }, false)

    request.raw.on('close', () => {
      unsubscribe()
      if (!ended) { ended = true; reply.raw.end() }
    })
  })

  // --- Regenerate a specific chapter ---

  fastify.post<{
    Params: { id: string; num: string }
    Body: unknown
  }>('/api/books/:id/chapters/:num/regenerate', { schema: { params: bookChapterSchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    let body: { model: string; provider?: string; quizModel?: string; quizProvider?: string; quizLength?: number }
    try {
      body = GenerateNextBodySchema.parse(request.body)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }

    const bookId = request.params.id
    const chapterNum = parseInt(request.params.num)
    const meta = await store.getBook(bookId)

    if (chapterNum < 1 || chapterNum > meta.totalChapters) {
      return reply.status(400).send({ error: `Chapter ${chapterNum} out of range (1-${meta.totalChapters})` })
    }
    if (chapterNum > meta.generatedUpTo) {
      return reply.status(400).send({ error: `Chapter ${chapterNum} has not been generated yet` })
    }

    if (genManager.isGenerating(bookId)) {
      return reply.status(409).send({ error: 'Generation already in progress for this book' })
    }

    if (taskManager.getActiveTaskForBook(bookId, 'generate-all')) {
      return reply.status(409).send({ error: 'Generate-all is running for this book' })
    }

    const { model, provider, quizModel, quizProvider, quizLength } = body
    genManager.startGeneration(bookId, { model, provider, quizModel, quizProvider, quizLength, targetChapterNum: chapterNum })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    let ended = false
    const unsubscribe = genManager.subscribe(bookId, (event) => {
      if (ended) return
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      if (event.type === 'done' || event.type === 'error') {
        ended = true
        reply.raw.end()
      }
    }, false)

    request.raw.on('close', () => {
      unsubscribe()
      if (!ended) { ended = true; reply.raw.end() }
    })
  })

  // --- Generation status & reconnect ---

  fastify.get<{ Params: { id: string } }>('/api/books/:id/generation-status', { schema: { params: bookIdSchema } }, async (request) => {
    return genManager.getStatus(request.params.id)
  })

  fastify.get<{ Params: { id: string } }>('/api/books/:id/generation-stream', { schema: { params: bookIdSchema } }, async (request, reply) => {
    const bookId = request.params.id
    const status = genManager.getStatus(bookId)

    if (!status.active) {
      return reply.status(404).send({ error: 'No active generation for this book' })
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    let ended = false
    const unsubscribe = genManager.subscribe(bookId, (event) => {
      if (ended) return
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      if (event.type === 'done' || event.type === 'error') {
        ended = true
        reply.raw.end()
      }
    }, true)

    request.raw.on('close', () => {
      unsubscribe()
      if (!ended) { ended = true; reply.raw.end() }
    })
  })

  fastify.post<{ Body: unknown }>('/api/books', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    let body: { topic: string; details?: string; chapterCount?: number; model: string; provider?: string; quizModel?: string; quizProvider?: string; quizLength?: number }
    try {
      body = CreateBookBodySchema.parse(request.body)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }

    const { topic, details, chapterCount, model, provider } = body

    const bookId = randomUUID().slice(0, 12)

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const send = (data: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    try {
      // Persist book immediately so it appears in the library during generation
      const now = new Date().toISOString()
      await store.saveBook({
        id: bookId,
        title: topic,
        prompt: `${topic}${details ? `\n\n${details}` : ''}`,
        status: 'generating_toc',
        totalChapters: chapterCount ?? DEFAULT_CHAPTER_COUNT,
        generatedUpTo: 0,
        createdAt: now,
        updatedAt: now,
        tags: [],
        audioGeneratedChapters: [],
      })
      send({ type: 'book_created', bookId, title: topic, totalChapters: chapterCount ?? DEFAULT_CHAPTER_COUNT })

      // Phase 1: Generate TOC
      const profileContext = await buildProfileContext()
      let tocText = ''
      const tocTimeout = createTimeout()
      const tocResult = streamText({
        model: createModelClient(provider ?? DEFAULT_PROVIDER, model),
        abortSignal: tocTimeout.signal,
        system: `You are creating a table of contents for a personalized learning book.

Generate a well-structured table of contents with exactly ${chapterCount ?? DEFAULT_CHAPTER_COUNT} chapters.

Start with a # heading for the book title. Think like an O'Reilly or Pragmatic Bookshelf editor:
- Title: 2-5 words, memorable and specific. No filler like "Comprehensive Guide to" or "Introduction to".
- Subtitle: max 8 words, a punchy tagline — not a sentence. No "A guide to..." or "How to..." patterns.

Then list each chapter as a numbered item with:
- A **bold chapter title**
- An em-dash followed by a one-sentence description

Example format:
# Resilient CSS
*Layout Systems for the Real World*

# Temporal in Practice
*Durable Workflows Beyond Request-Response*

1. **The Box Model Revisited** — Understanding the foundation that everything else builds on.
2. **Flexbox Deep Dive** — Layout patterns that solve real problems elegantly.

${profileContext ? `\nReader profile:\n${profileContext}\n\nTailor the book structure and difficulty to match the reader's background and preferences.\n` : ''}Just output the title and table of contents, nothing else.

${MARKDOWN_FORMATTING_RULES}`,
        prompt: `Create a table of contents for a book about: ${topic}${details ? `\n\nAdditional context: ${details}` : ''}`,
      })

      for await (const chunk of tocResult.textStream) {
        tocText += chunk
        send({ type: 'toc', text: chunk })
      }
      tocTimeout.clear()

      const { title, subtitle, chapters: parsedChapters } = parseTocFromMarkdown(tocText)
      const targetCount = chapterCount ?? DEFAULT_CHAPTER_COUNT
      const chapters = truncateChapters(parsedChapters, targetCount)

      if (chapters.length === 0) {
        const snippet = tocText.trim().slice(0, TOC_ERROR_SNIPPET_CHARS)
        console.error(`[POST /api/books] TOC parse failed for "${bookId}". Raw model output:\n---\n${tocText}\n---`)
        send({
          type: 'error',
          message: snippet
            ? `Failed to parse table of contents — model returned: "${snippet}${tocText.length > 300 ? '…' : ''}"`
            : 'Failed to parse table of contents — model returned empty response',
        })
        reply.raw.end()
        return
      }

      // Update the early-persisted book with real title/subtitle from AI
      const existingMeta = await store.getBook(bookId)
      existingMeta.title = title
      existingMeta.subtitle = subtitle
      existingMeta.status = 'toc_review'
      existingMeta.totalChapters = chapters.length
      existingMeta.updatedAt = new Date().toISOString()
      await store.saveBook(existingMeta)
      await store.saveToc(bookId, { chapters })

      send({ type: 'toc_done', bookId, title, subtitle, totalChapters: chapters.length })
      send({ type: 'done', bookId, title, totalChapters: chapters.length })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Generation failed'
      console.error(`[POST /api/books] Book "${bookId}" generation failed:`, error)
      // Mark as failed instead of deleting — preserves any partial content
      try {
        const meta = await store.getBook(bookId)
        meta.status = 'failed'
        meta.updatedAt = new Date().toISOString()
        await store.saveBook(meta)
      } catch {
        // If we can't even update the status, delete as last resort
        try { await store.deleteBook(bookId) } catch { /* ignore */ }
      }
      send({
        type: 'error',
        message: errorMessage,
      })
    }

    reply.raw.end()
  })

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/toc/revise',
    { schema: { params: bookIdSchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      let body: { feedback: string; model: string; provider?: string }
      try {
        body = ReviseTocBodySchema.parse(request.body)
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: err.issues })
        }
        throw err
      }

      const bookId = request.params.id
      const book = await store.getBook(bookId)

      if (book.status !== 'toc_review') {
        return reply.status(409).send({
          error: 'Invalid status',
          message: `Book must be in 'toc_review' status to revise; currently '${book.status}'`,
          currentStatus: book.status,
        })
      }

      const currentToc = await store.getToc(bookId)
      if (currentToc.chapters.length === 0) {
        return reply.status(400).send({ error: 'No existing TOC to revise' })
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      const send = (data: Record<string, unknown>) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
      }

      try {
        const profileContext = await buildProfileContext()
        const feedback = sanitizeFeedback(body.feedback)

        const existingTocMarkdown = `# ${book.title}${book.subtitle ? `\n*${book.subtitle}*` : ''}\n\n${currentToc.chapters
          .map((ch, i) => `${i + 1}. **${ch.title}** — ${ch.description}`)
          .join('\n')}`

        let revisedText = ''
        const timeout = createTimeout()
        const result = streamText({
          model: createModelClient(body.provider ?? DEFAULT_PROVIDER, body.model),
          abortSignal: timeout.signal,
          system: `You are revising an existing table of contents. Apply ONLY the reader's targeted changes. Every chapter the reader did not mention must be preserved EXACTLY — same title, same description, same position.

Constraints:
- The revised TOC must have exactly ${book.totalChapters} chapters, UNLESS the reader explicitly requested a different count in their feedback.
- Preserve the title and subtitle UNLESS the reader asked to change them.
- For any chapter the reader did not reference, output it verbatim — do not rephrase, restructure, or "improve" it.
- Output in the same numbered markdown format as the existing TOC.
${profileContext ? `\nReader profile:\n${profileContext}\n` : ''}
Just output the title and table of contents, nothing else.

${MARKDOWN_FORMATTING_RULES}`,
          prompt: `Existing TOC:
${existingTocMarkdown}

Reader's requested changes:
${feedback}`,
        })

        for await (const chunk of result.textStream) {
          revisedText += chunk
          send({ type: 'toc', text: chunk })
        }
        timeout.clear()

        const parsed = parseTocFromMarkdown(revisedText)
        if (parsed.chapters.length === 0) {
          send({ type: 'error', message: "Couldn't parse the revised TOC — try rephrasing your feedback." })
          reply.raw.end()
          return
        }

        // Cap at the schema's hard ceiling. The AI is told the user-requested
        // count in the prompt; if they explicitly asked for more chapters, the
        // new count flows through. If the AI overshot the absolute ceiling
        // (500), truncate.
        const chaptersFinal = truncateChapters(parsed.chapters, MAX_CHAPTERS)

        // Persist — chapters only, no skills (deferred to /start)
        await store.saveToc(bookId, { chapters: chaptersFinal })

        // Update meta — title, subtitle (if AI returned one), and
        // totalChapters whenever the chapter count changed.
        let metaChanged = false
        if (parsed.title && parsed.title !== book.title) {
          book.title = parsed.title
          metaChanged = true
        }
        // Only update subtitle if AI returned one — if the AI forgets to repeat the
        // subtitle line, we keep the existing one rather than clobber it. (The revise
        // prompt tells the AI to preserve subtitle unless asked to change it.) This
        // means subtitle can't be explicitly cleared via revise, which is acceptable
        // given how much more common the "AI forgot to repeat it" case is.
        if (parsed.subtitle !== undefined && parsed.subtitle !== book.subtitle) {
          book.subtitle = parsed.subtitle
          metaChanged = true
        }
        if (chaptersFinal.length !== book.totalChapters) {
          book.totalChapters = chaptersFinal.length
          metaChanged = true
        }
        if (metaChanged) {
          book.updatedAt = new Date().toISOString()
          await store.saveBook(book)
        }

        send({
          type: 'toc_revised',
          bookId,
          title: book.title,
          subtitle: book.subtitle,
          totalChapters: chaptersFinal.length,
        })
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        reply.raw.end()
      }
    },
  )

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/start',
    { schema: { params: bookIdSchema }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      let body: { model: string; provider?: string; quizModel?: string; quizProvider?: string; quizLength?: number }
      try {
        body = StartBookBodySchema.parse(request.body)
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: err.issues })
        }
        throw err
      }

      const bookId = request.params.id
      const book = await store.getBook(bookId)

      if (book.status !== 'toc_review') {
        return reply.status(409).send({
          error: 'Invalid status',
          message: `Book must be in 'toc_review' status to start; currently '${book.status}'`,
          currentStatus: book.status,
        })
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      const send = (data: Record<string, unknown>) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
      }

      try {
        const profileContext = await buildProfileContext()
        // Pull topic/details from the stored prompt — split on the first \n\n
        // Use the user-typed topic (promptParts[0]), not the AI-generated/revised title
        const promptParts = book.prompt.split('\n\n')
        const topic = promptParts[0] ?? book.title
        const details = promptParts.length > 1 ? promptParts.slice(1).join('\n\n') : undefined

        await generateFirstChapterAndQuiz(bookId, send, {
          provider: body.provider ?? DEFAULT_PROVIDER,
          model: body.model,
          quizProvider: body.quizProvider ?? body.provider ?? DEFAULT_PROVIDER,
          quizModel: body.quizModel ?? body.model,
          quizLength: body.quizLength ?? DEFAULT_QUIZ_LENGTH,
          profileContext,
          topic,
          details,
        })
        send({ type: 'done', bookId })
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        reply.raw.end()
      }
    },
  )

  // --- Generate All ---

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/books/:id/generate-all',
    { schema: { params: bookIdSchema } },
    async (request, reply) => {
      let body: { model: string; provider?: string; quizModel?: string; quizProvider?: string; quizLength?: number }
      try {
        body = GenerateNextBodySchema.parse(request.body)
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: err.issues })
        }
        throw err
      }

      const bookId = request.params.id
      const meta = await store.getBook(bookId)

      if (meta.generatedUpTo >= meta.totalChapters) {
        return reply.status(400).send({ error: 'All chapters already generated' })
      }

      if (taskManager.getActiveTaskForBook(bookId, 'generate-all')) {
        return reply.status(409).send({ error: 'Generate-all already in progress for this book' })
      }

      if (genManager.isGenerating(bookId)) {
        return reply.status(409).send({ error: 'Single chapter generation in progress — wait for it to finish' })
      }

      const startFrom = meta.generatedUpTo + 1
      const total = meta.totalChapters
      const task = taskManager.createTask('generate-all', bookId, meta.title, total)

      // Fire-and-forget
      ;(async () => {
        try {
          for (let num = startFrom; num <= total; num++) {
            // Check cancellation
            if (task.abortController.signal.aborted) return

            // Wait if single-chapter generation is active
            while (genManager.isGenerating(bookId)) {
              await new Promise(r => setTimeout(r, 1000))
              if (task.abortController.signal.aborted) return
            }

            taskManager.updateProgress(task.id, num, `Generating chapter ${num} of ${total}`)

            await genManager.generateSingleChapter(bookId, num, {
              ...body,
              abortSignal: task.abortController.signal,
            })
          }
          taskManager.completeTask(task.id)
        } catch (err) {
          if (task.abortController.signal.aborted) return
          taskManager.failTask(task.id, err instanceof Error ? err.message : 'Generation failed')
        }
      })()

      return { taskId: task.id }
    },
  )

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
