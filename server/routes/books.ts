import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { streamText } from 'ai'
import * as store from '../services/book-store.js'
import { createModelClient } from '../services/model-client.js'

interface CreateBookBody {
  topic: string
  details?: string
  apiKey: string
  model: string
  provider?: string
}

function parseTocFromMarkdown(text: string): { title: string; chapters: Array<{ title: string; description: string }> } {
  const lines = text.split('\n').filter(l => l.trim())
  let title = ''
  const chapters: Array<{ title: string; description: string }> = []

  for (const line of lines) {
    const titleMatch = line.match(/^#\s+(.+)/)
    if (titleMatch && !title) {
      title = titleMatch[1].replace(/\*\*/g, '').trim()
      continue
    }

    // 1. **Chapter Title** — Description  or  1. **Chapter Title** - Description
    const chapterMatch = line.match(/^\d+\.\s+\*\*(.+?)\*\*\s*[—–\-:]\s*(.+)/)
    if (chapterMatch) {
      chapters.push({
        title: chapterMatch[1].trim(),
        description: chapterMatch[2].trim(),
      })
    }
  }

  if (!title && chapters.length > 0) {
    title = 'Untitled Book'
  }

  return { title, chapters }
}

export async function bookRoutes(fastify: FastifyInstance) {
  fastify.get('/api/books', async () => {
    return store.listBooks()
  })

  fastify.get<{ Params: { id: string } }>('/api/books/:id', async (request) => {
    return store.getBook(request.params.id)
  })

  fastify.get<{ Params: { id: string; num: string } }>(
    '/api/books/:id/chapters/:num',
    async (request) => {
      const content = await store.getChapter(request.params.id, parseInt(request.params.num))
      return { content }
    },
  )

  fastify.get<{ Params: { id: string } }>('/api/books/:id/toc', async (request) => {
    return store.getToc(request.params.id)
  })

  fastify.delete<{ Params: { id: string } }>('/api/books/:id', async (request) => {
    await store.deleteBook(request.params.id)
    return { ok: true }
  })

  fastify.post<{ Body: CreateBookBody }>('/api/books', async (request, reply) => {
    const { topic, details, apiKey, model, provider } = request.body

    if (!apiKey) {
      return reply.status(400).send({ error: 'API key is required' })
    }
    if (!topic?.trim()) {
      return reply.status(400).send({ error: 'Topic is required' })
    }

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
      // Phase 1: Generate TOC
      let tocText = ''
      const tocResult = streamText({
        model: createModelClient(provider ?? 'anthropic', apiKey, model),
        system: `You are creating a table of contents for a personalized learning book.

Generate a well-structured table of contents with 8-15 chapters.

Start with a # heading that is the book title (make it compelling and specific).
Then list each chapter as a numbered item with:
- A **bold chapter title**
- An em-dash followed by a one-sentence description

Example format:
# Mastering Modern CSS Architecture

1. **The Box Model Revisited** — Understanding the foundation that everything else builds on.
2. **Flexbox Deep Dive** — Layout patterns that solve real problems elegantly.

Just output the title and table of contents, nothing else.`,
        prompt: `Create a table of contents for a book about: ${topic}${details ? `\n\nAdditional context: ${details}` : ''}`,
      })

      for await (const chunk of tocResult.textStream) {
        tocText += chunk
        send({ type: 'toc', text: chunk })
      }

      const { title, chapters } = parseTocFromMarkdown(tocText)

      if (chapters.length === 0) {
        send({ type: 'error', message: 'Failed to parse table of contents from AI response' })
        reply.raw.end()
        return
      }

      const now = new Date().toISOString()
      await store.saveBook({
        id: bookId,
        title,
        prompt: `${topic}${details ? `\n\n${details}` : ''}`,
        status: 'generating',
        totalChapters: chapters.length,
        generatedUpTo: 0,
        createdAt: now,
        updatedAt: now,
      })
      await store.saveToc(bookId, { chapters })

      send({ type: 'toc_done', bookId, title, totalChapters: chapters.length })

      // Phase 2: Generate Chapter 1
      let chapterText = ''
      const chapterResult = streamText({
        model: createModelClient(provider ?? 'anthropic', apiKey, model),
        system: `You are writing a chapter for a personalized learning book. Write an engaging, clear chapter approximately 1,500 words long.

Use markdown formatting:
- Start with # heading for the chapter title
- Use ## and ### for sections
- Bold and italic for emphasis
- Bullet/numbered lists where appropriate
- Code blocks with language tags where relevant
- > blockquotes for key insights or memorable takeaways

Write in a conversational but knowledgeable tone. Use concrete examples and real-world analogies. Make complex ideas accessible without being condescending.`,
        prompt: `Book: ${title}
Topic: ${topic}${details ? `\nContext: ${details}` : ''}

This is Chapter 1 of ${chapters.length}.
Chapter title: ${chapters[0].title}
Chapter description: ${chapters[0].description}

Write this chapter now.`,
      })

      for await (const chunk of chapterResult.textStream) {
        chapterText += chunk
        send({ type: 'chapter', text: chunk })
      }

      await store.saveChapter(bookId, 1, chapterText)

      const meta = await store.getBook(bookId)
      meta.generatedUpTo = 1
      meta.status = 'reading'
      meta.updatedAt = new Date().toISOString()
      await store.saveBook(meta)

      send({ type: 'done', bookId, title, totalChapters: chapters.length })
    } catch (error) {
      send({
        type: 'error',
        message: error instanceof Error ? error.message : 'Generation failed',
      })
    }

    reply.raw.end()
  })
}
