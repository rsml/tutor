import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { chatRoutes } from './routes/chat.js'
import { bookRoutes } from './routes/books.js'
import { settingsRoutes } from './routes/settings.js'
import { profileRoutes } from './routes/profile.js'
import { taskRoutes } from './routes/tasks.js'
import { coverRoutes } from './routes/covers.js'
import { importRoutes } from './routes/import.js'
import { modelsRoutes } from './routes/models.js'
import { audiobookRoutes } from './routes/audiobook.js'
import { recoverFromCrash } from './services/book-store.js'
import { registerErrorHandler } from './http/error-handler.js'
import { STATUS_FORBIDDEN, STATUS_NO_CONTENT } from './http/status.js'
import { createKrokiDiagramRenderer } from './adapters/kroki-diagram-renderer.js'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3147',
]

// Default mermaid renderer — Electron overrides this decoration at startup
// with a BrowserWindow-based adapter. This module-scope instance backs the
// standalone/dev server mode fallback.
const krokiDiagramRenderer = createKrokiDiagramRenderer()

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true
  // Allow null origin (file:// protocol in Electron)
  if (origin === 'null') return true
  // Allow any localhost/127.0.0.1 origin (single-user app, server is localhost-only)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  return false
}

/**
 * Builds a fully wired Fastify instance: logger config, the CORS onRequest
 * hook, the mermaidRenderer decoration, rate-limit registration, every route
 * registration, and the global error handler plus health route.
 *
 * Does NOT call recoverFromCrash() and does NOT listen — the returned
 * instance has not bound a port and has not run crash recovery. Callers
 * (startServer, or tests/tooling via fastify.inject) own those steps
 * themselves, so tests can inject requests against a real, fully-registered
 * instance without starting a server or mutating on-disk book state via
 * crash recovery.
 */
export async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: 'info',
      redact: {
        paths: ['req.body.apiKey'],
        censor: '[REDACTED]',
      },
      serializers: {
        req(request) {
          const traceId = request.headers['x-trace-id']
          return {
            method: request.method,
            url: request.url,
            ...(typeof traceId === 'string' && traceId ? { traceId } : {}),
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
      reply.status(STATUS_FORBIDDEN).send({ error: 'Not allowed by CORS' })
      return
    }
    if (origin) {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin)
      reply.raw.setHeader('Vary', 'Origin')
    }
    const traceId = request.headers['x-trace-id']
    if (typeof traceId === 'string' && traceId) {
      reply.raw.setHeader('X-Trace-Id', traceId)
    }
    if (request.method === 'OPTIONS') {
      reply.raw.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      reply.raw.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Trace-Id')
      reply.status(STATUS_NO_CONTENT).send()
      return
    }
  })

  // Mermaid renderer — Electron sets this to a BrowserWindow-based renderer.
  // Falls back to the kroki.io-backed adapter for standalone/dev server mode.
  // Returns PNG as <img> tags with file:// URLs (epub-gen-memory doesn't support data: URLs).
  fastify.decorate('mermaidRenderer', krokiDiagramRenderer.render)

  // MUST come before the route plugins below. Fastify only propagates an error
  // handler to encapsulation contexts created after it is set, so registering
  // it afterwards, as this file used to, left every route on Fastify's default
  // handler and the app's own handler dead.
  registerErrorHandler(fastify)

  await fastify.register(rateLimit, { global: false })

  await fastify.register(chatRoutes)
  await fastify.register(bookRoutes)
  await fastify.register(settingsRoutes)
  await fastify.register(profileRoutes)
  await fastify.register(taskRoutes)
  await fastify.register(coverRoutes)
  await fastify.register(importRoutes)
  await fastify.register(modelsRoutes)
  await fastify.register(audiobookRoutes)

  fastify.get('/api/health', async () => ({ status: 'ok' }))

  return fastify
}

export async function startServer(port = 3147, host = '127.0.0.1') {
  const fastify = await buildServer()

  const recovery = await recoverFromCrash()
  if (recovery.booksReset.length > 0 || recovery.artifactsRemoved.length > 0) {
    fastify.log.info(
      { booksReset: recovery.booksReset.length, artifactsRemoved: recovery.artifactsRemoved.length },
      'Crash recovery completed',
    )
  }
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
