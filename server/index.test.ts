import { describe, it, expect } from 'vitest'
import { mkdtempSync, chmodSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { buildServer, runStartupTasks } from './index.js'
import { createPorts } from './composition-root.js'
import { createFakeLibraryMigrator } from './ports/library-migrator.fake.js'
import { createFakeBookRepository } from './ports/book-repository.fake.js'
import { createFakeArtifactStore } from './ports/artifact-store.fake.js'

describe('buildServer', () => {
  // Protects the routes-doc generator and every fastify.inject-based
  // characterization test in this repo, all of which call buildServer()
  // and expect a fully registered instance with no side effect on the data
  // directory. Making the directory read-only before building proves
  // buildServer() itself never writes, independent of whether the request
  // injected against it would have.
  it('never writes to the data directory while registering every route', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tutor-buildserver-mutation-test-'))
    const previousDataDir = process.env.TUTOR_DATA_DIR
    process.env.TUTOR_DATA_DIR = dir
    chmodSync(dir, 0o500)

    try {
      const fastify = await buildServer()
      const res = await fastify.inject({ method: 'GET', url: '/api/health' })
      expect(res.statusCode).toBe(200)
      await fastify.close()
    } finally {
      chmodSync(dir, 0o700)
      if (previousDataDir === undefined) {
        delete process.env.TUTOR_DATA_DIR
      } else {
        process.env.TUTOR_DATA_DIR = previousDataDir
      }
    }

    expect(readdirSync(dir)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('runStartupTasks', () => {
  // The three-step boot block used to live inline in startServer, which
  // binds a real port and therefore is awkward to drive directly from a
  // test. Extracted so this can call it straight, with fakes, and assert
  // on ordering without listening on anything.
  it('runs migration before the first bookRepository read that crash recovery performs', async () => {
    const callOrder: string[] = []

    const realMigrator = createFakeLibraryMigrator()
    const libraryMigrator = {
      async migrate() {
        callOrder.push('libraryMigrator.migrate')
        return realMigrator.migrate()
      },
    }

    const realBooks = createFakeBookRepository()
    const bookRepository = {
      ...realBooks,
      async listBooks() {
        callOrder.push('bookRepository.listBooks')
        return realBooks.listBooks()
      },
    }

    const ports = createPorts({ libraryMigrator, bookRepository, artifactStore: createFakeArtifactStore() })

    // A bare, non-listening Fastify instance exists here only to borrow a
    // real FastifyBaseLogger, so runStartupTasks gets the exact type it
    // asks for without a full buildServer() and without hand-stubbing
    // pino's logger interface.
    const silent = Fastify({ logger: false })
    await runStartupTasks(ports, silent.log)
    await silent.close()

    expect(callOrder).toEqual(['libraryMigrator.migrate', 'bookRepository.listBooks'])
  })
})
