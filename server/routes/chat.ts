import type { FastifyInstance } from 'fastify'
import { streamText } from 'ai'
import { ZodError } from 'zod'
import { createModelClient } from '../services/model-client.js'
import { ChatBodySchema } from '../schemas.js'

const AI_TIMEOUT_MS = 5 * 60 * 1000

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: unknown }>('/api/chat', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    let body: {
      model: string
      provider?: string
      chapterContent: string
      selectedText: string
      userMessage: string
      history: Array<{ role: 'user' | 'assistant'; content: string }>
    }
    try {
      body = ChatBodySchema.parse(request.body)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid request', details: err.issues })
      }
      throw err
    }

    const { model, provider, chapterContent, selectedText, userMessage, history } = body

    const modelClient = createModelClient(provider ?? 'anthropic', model)

    const systemPrompt = `You are a concise, knowledgeable tutor helping a learner understand a passage from a book they are reading.

## Chapter context (for reference only):
${chapterContent.slice(0, 4000)}

## Selected passage the learner is asking about:
"${selectedText}"

## Instructions:
- Be concise and clear — aim for 2-4 short paragraphs max
- Use concrete examples and analogies
- If the learner asks a follow-up, build on your previous answers
- Use markdown formatting where helpful (bold, lists, code blocks)
- Never repeat the full selected passage back — the learner can see it`

    const messages = [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userMessage },
    ]

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

    const result = streamText({
      model: modelClient,
      system: systemPrompt,
      messages,
      abortSignal: controller.signal,
    })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    for await (const chunk of result.textStream) {
      reply.raw.write(chunk)
    }
    clearTimeout(timer)

    reply.raw.end()
  })
}
