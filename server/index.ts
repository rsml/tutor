import Fastify from 'fastify'
import cors from '@fastify/cors'
import { chatRoutes } from './routes/chat.js'
import { bookRoutes } from './routes/books.js'

export async function startServer(port = 3147, host = '127.0.0.1') {
  const fastify = Fastify({
    logger: {
      level: 'info',
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
          }
        },
      },
    },
  })

  await fastify.register(cors, {
    origin: /^http:\/\/localhost(:\d+)?$/,
  })
  await fastify.register(chatRoutes)
  await fastify.register(bookRoutes)

  fastify.get('/api/health', async () => ({ status: 'ok' }))

  await fastify.listen({ port, host })
  return fastify
}

// Allow standalone usage: pnpm dev:server
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('/server/index.ts') ||
  process.argv[1].endsWith('/server/index.js')
)
if (isDirectRun) {
  startServer(3147, '127.0.0.1')
}
