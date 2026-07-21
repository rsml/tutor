import Fastify from 'fastify'
import type { FastifyInstance, FastifyBaseLogger } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { chatRoutes } from './routes/chat.js'
import { libraryRoutes } from './routes/library.js'
import { readingRoutes } from './routes/reading.js'
import { assessmentRoutes } from './routes/assessment.js'
import { suggestionRoutes } from './routes/suggestions.js'
import { epubRoutes } from './routes/epub.js'
import { audiobookGenerationRoutes } from './routes/audiobook-generation.js'
import { generationRoutes } from './routes/generation.js'
import { authoringRoutes } from './routes/authoring.js'
import { settingsRoutes } from './routes/settings.js'
import { profileRoutes } from './routes/profile.js'
import { taskRoutes } from './routes/tasks.js'
import { coverRoutes } from './routes/covers.js'
import { importRoutes } from './routes/import.js'
import { modelsRoutes } from './routes/models.js'
import { audiobookRoutes } from './routes/audiobook.js'
import { getDataDir } from '@shared/node/data-dir.js'
import { createRecoverFromCrash } from './services/recover-from-crash.js'
import { registerErrorHandler } from './http/error-handler.js'
import { STATUS_FORBIDDEN, STATUS_NO_CONTENT } from './http/status.js'
import { createPorts, createSharedServices, type Ports } from './composition-root.js'
import type { MigrationReport } from './ports/library-migrator.js'

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

/**
 * Builds a fully wired Fastify instance: logger config, the CORS onRequest
 * hook, rate-limit registration, every route registration, and the global
 * error handler plus health route.
 *
 * Does NOT call recoverFromCrash() and does NOT listen — the returned
 * instance has not bound a port and has not run crash recovery. Callers
 * (startServer, or tests/tooling via fastify.inject) own those steps
 * themselves, so tests can inject requests against a real, fully-registered
 * instance without starting a server or mutating on-disk book state via
 * crash recovery.
 *
 * `overrides` replaces individual adapters before anything is registered,
 * so a caller gets a real, fully-registered server whose edges are fakes.
 * That is how the characterization suite drives streaming and generation
 * routes without a provider key, and how Electron supplies its own
 * BrowserWindow-backed diagram renderer. Every route plugin receives the
 * resolved ports, plus the shared in-memory services built from them, as
 * its plugin options, so a route module never reaches for a concrete
 * adapter and never has to be edited when one is swapped.
 */
export async function buildServer(overrides: Partial<Ports> = {}): Promise<FastifyInstance> {
  const ports = createPorts(overrides)
  const services = createSharedServices(ports)
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

  // MUST come before the route plugins below. Fastify only propagates an error
  // handler to encapsulation contexts created after it is set, so registering
  // it afterwards, as this file used to, left every route on Fastify's default
  // handler and the app's own handler dead.
  registerErrorHandler(fastify)

  await fastify.register(rateLimit, { global: false })

  // Every route plugin gets the same resolved ports, and the same shared
  // services built from them, as its plugin options. Fastify hands a plugin
  // its options as the second argument, so a route module reads what it
  // needs off `{ ports, services }` instead of importing an adapter or a
  // module-scope singleton, and nothing in this file changes when one is
  // swapped.
  await fastify.register(chatRoutes, { ports, services })
  await fastify.register(libraryRoutes, { ports, services })
  await fastify.register(readingRoutes, { ports, services })
  await fastify.register(assessmentRoutes, { ports, services })
  await fastify.register(suggestionRoutes, { ports, services })
  await fastify.register(epubRoutes, { ports, services })
  await fastify.register(audiobookGenerationRoutes, { ports, services })
  await fastify.register(generationRoutes, { ports, services })
  await fastify.register(authoringRoutes, { ports, services })
  await fastify.register(settingsRoutes, { ports, services })
  await fastify.register(profileRoutes, { ports, services })
  await fastify.register(taskRoutes, { ports, services })
  await fastify.register(coverRoutes, { ports, services })
  await fastify.register(importRoutes, { ports, services })
  await fastify.register(modelsRoutes, { ports, services })
  await fastify.register(audiobookRoutes, { ports, services })

  fastify.get('/api/health', async () => ({ status: 'ok' }))

  return fastify
}

function countMigrationOutcomes(report: MigrationReport): { migrated: number; failed: number } {
  let migrated = report.profile.outcome === 'migrated' ? 1 : 0
  let failed = report.profile.outcome === 'failed' ? 1 : 0
  for (const book of report.books) {
    if (book.outcome === 'migrated') migrated++
    if (book.outcome === 'failed') failed++
  }
  return { migrated, failed }
}

/**
 * The startup sequence startServer runs before it binds a port, pulled out
 * on its own so a test can drive it directly, with a fake libraryMigrator
 * and a fake bookRepository, without binding a real port or standing up a
 * full listening server.
 *
 * Order is load bearing. Migration has to run before crash recovery,
 * because crash recovery reads and writes BookMeta through the CURRENT Zod
 * schema, via BookRepository, so a book still at an old schema version
 * would be silently skipped by listBooks's own try/catch, per
 * fs-book-repository.ts, and would never be reached by recovery at all.
 * Running the migrator first is what guarantees every book crash recovery
 * sees is one BookRepository can actually read.
 */
export async function runStartupTasks(ports: Ports, log: FastifyBaseLogger): Promise<void> {
  const migration = await ports.libraryMigrator.migrate()
  const outcomes = countMigrationOutcomes(migration)
  if (outcomes.migrated > 0 || outcomes.failed > 0) {
    log.info(outcomes, 'Library migration completed')
  }

  const recoverFromCrash = createRecoverFromCrash({
    bookRepository: ports.bookRepository,
    artifactStore: ports.artifactStore,
    dataDir: getDataDir(),
  })
  const recovery = await recoverFromCrash()
  if (recovery.booksReset.length > 0 || recovery.artifactsRemoved.length > 0) {
    log.info(
      { booksReset: recovery.booksReset.length, artifactsRemoved: recovery.artifactsRemoved.length },
      'Crash recovery completed',
    )
  }
}

/**
 * Builds the server, runs startup migration and crash recovery, and
 * listens. `overrides` is forwarded to {@link buildServer}, which is how
 * Electron hands in its own BrowserWindow-backed diagram renderer at
 * startup instead of reaching into the built instance and reassigning a
 * decoration afterwards.
 */
export async function startServer(port = 3147, host = '127.0.0.1', overrides: Partial<Ports> = {}) {
  const fastify = await buildServer(overrides)

  // A second createPorts(overrides) call, independent of the one buildServer
  // made for the routes it registered. Every port is either a stateless
  // bridge to the same on-disk data either way, or, in a test, the exact
  // same override object either time, since createPorts always applies
  // overrides last, so this composes identically to how the book-store.js
  // shim this replaced built its own adapters from getDataDir() rather than
  // reusing buildServer's. See runStartupTasks's doc comment for why
  // migration has to precede crash recovery.
  const ports = createPorts(overrides)
  await runStartupTasks(ports, fastify.log)

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
