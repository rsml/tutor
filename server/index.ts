import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { chatRoutes } from './routes/chat.js'
import { bookRoutes } from './routes/books.js'
import { settingsRoutes } from './routes/settings.js'
import { profileRoutes } from './routes/profile.js'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3147',
]

export async function startServer(port = 3147, host = '127.0.0.1') {
  const fastify = Fastify({
    logger: {
      level: 'info',
      redact: {
        paths: ['req.body.apiKey'],
        censor: '[REDACTED]',
      },
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
    origin: (origin, cb) => {
      // Allow requests with no origin (Electron, curl, etc.)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        cb(null, true)
      } else {
        cb(new Error('Not allowed by CORS'), false)
      }
    },
  })

  await fastify.register(rateLimit, { global: false })

  await fastify.register(chatRoutes)
  await fastify.register(bookRoutes)
  await fastify.register(settingsRoutes)
  await fastify.register(profileRoutes)

  // Global error handler — clean 404 for ENOENT, no path leak
  fastify.setErrorHandler((error: Error & { code?: string; statusCode?: number }, _request, reply) => {
    if (error.code === 'ENOENT') {
      return reply.status(404).send({ error: 'Not found' })
    }
    const statusCode = error.statusCode ?? 500
    reply.status(statusCode).send({
      error: error.message || 'Internal server error',
    })
  })

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
