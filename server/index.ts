import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { chatRoutes } from './routes/chat.js'
import { bookRoutes } from './routes/books.js'
import { settingsRoutes } from './routes/settings.js'
import { profileRoutes } from './routes/profile.js'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3147',
]

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true
  // Allow null origin (file:// protocol in Electron)
  if (origin === 'null') return true
  // Allow any localhost/127.0.0.1 origin (single-user app, server is localhost-only)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  return false
}

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

  // Manual CORS via onRequest hook — sets headers on reply.raw so they
  // survive streaming routes that use reply.raw.writeHead().
  // @fastify/cors uses reply.header() which only applies during reply.send(),
  // so streaming routes that bypass send() would lose CORS headers.
  fastify.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin
    if (origin && !isAllowedOrigin(origin)) {
      reply.status(403).send({ error: 'Not allowed by CORS' })
      return
    }
    if (origin) {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin)
      reply.raw.setHeader('Vary', 'Origin')
    }
    if (request.method === 'OPTIONS') {
      reply.raw.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      reply.raw.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      reply.status(204).send()
      return
    }
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
    if (statusCode >= 500) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Internal server error' })
    }
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
