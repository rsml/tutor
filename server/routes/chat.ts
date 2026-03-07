import type { FastifyInstance } from 'fastify'
import { streamText } from 'ai'
import { createModelClient } from '../services/model-client.js'

interface ChatBody {
  apiKey: string
  model: string
  provider?: string
  chapterContent: string
  selectedText: string
  userMessage: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: ChatBody }>('/api/chat', async (request, reply) => {
    const { apiKey, model, provider, chapterContent, selectedText, userMessage, history } = request.body

    if (!apiKey) {
      return reply.status(400).send({ error: 'API key is required' })
    }

    const modelClient = createModelClient(provider ?? 'anthropic', apiKey, model)

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

    const result = streamText({
      model: modelClient,
      system: systemPrompt,
      messages,
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

    reply.raw.end()
  })
}
