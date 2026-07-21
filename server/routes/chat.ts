import type { FastifyInstance } from 'fastify'
import { ChatBodySchema } from '@shared/contracts.js'
import { parseBody } from '../http/parse.js'
import { explainPassage } from '../services/explain-passage.js'
import type { Ports } from '../composition-root.js'

export async function chatRoutes(fastify: FastifyInstance, opts: { ports: Ports }) {
  fastify.post<{ Body: unknown }>('/api/chat', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parseBody(ChatBodySchema, request.body)

    reply.raw.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    for await (const chunk of explainPassage({ textGeneration: opts.ports.textGeneration }, body)) {
      reply.raw.write(chunk)
    }

    reply.raw.end()
  })
}
