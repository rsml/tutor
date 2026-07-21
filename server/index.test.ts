import { describe, it, expect } from 'vitest'
import { mkdtempSync, chmodSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { buildServer, runStartupTasks } from './index.js'
import { createPorts, createSharedServices } from './composition-root.js'
import { createFakeLibraryMigrator } from './ports/library-migrator.fake.js'
import { createFakeBookRepository } from './ports/book-repository.fake.js'
import { createFakeArtifactStore } from './ports/artifact-store.fake.js'
import { createFakeJobJournal } from './ports/job-journal.fake.js'

describe('buildServer decorations', () => {
  // The decoration exists so a caller acting on the server after it is
  // built reaches the same port instances the routes hold. createPorts
  // returns fresh adapters per call, deliberately, so a second call hands
  // back a BackgroundTasks nothing can observe. This test drives that
  // difference end to end rather than merely comparing object identity: a
  // task started through the decorated ports has to be visible through the
  // route, and it would not be if the two were separate instances.
  //
  // Startup job resume is the caller this protects. Without it, a resumed
  // job would be registered somewhere no route reads, so the tray would
  // stay empty and nothing would report an error.
  it('exposes the same ports the routes were registered with', async () => {
    const fastify = await buildServer()
    try {
      const handle = fastify.ports.backgroundTasks.start({
        type: 'generate-epub',
        bookId: 'decoration-book',
        bookTitle: 'Decoration Book',
        total: 1,
      })

      const res = await fastify.inject({ method: 'GET', url: '/api/tasks' })
      expect(res.statusCode).toBe(200)
      expect(res.json().map((t: { id: string }) => t.id)).toContain(handle.id)
    } finally {
      await fastify.close()
    }
  })

  it('exposes the same shared services the routes were registered with', async () => {
    const fastify = await buildServer()
    try {
      expect(fastify.services.chapterGenerationStream).toBeDefined()
      expect(fastify.services.chapterGenerationStream.getStatus('no-such-book')).toEqual({ active: false })
    } finally {
      await fastify.close()
    }
  })
})

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
  //
  // Migration before crash recovery: crash recovery reads and writes
  // BookMeta through the CURRENT Zod schema, so a book at an old schema
  // version would be silently skipped by listBooks's own try/catch if
  // migration had not already run.
  //
  // Crash recovery before resume: resume's own decisions (most concretely
  // audiobook resume, which restarts narration from the beginning) depend
  // on recovery having already reconciled BookMeta and wiped any partial
  // audio. Running resume first would race recovery over the same file.
  it('runs migration, then crash recovery, then interrupted-job resume, in that order', async () => {
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

    const realJournal = createFakeJobJournal()
    const jobJournal = {
      ...realJournal,
      async listInterrupted() {
        callOrder.push('jobJournal.listInterrupted')
        return realJournal.listInterrupted()
      },
    }

    const ports = createPorts({ libraryMigrator, bookRepository, artifactStore: createFakeArtifactStore(), jobJournal })
    const services = createSharedServices(ports)

    // A bare, non-listening Fastify instance exists here only to borrow a
    // real FastifyBaseLogger, so runStartupTasks gets the exact type it
    // asks for without a full buildServer() and without hand-stubbing
    // pino's logger interface.
    const silent = Fastify({ logger: false })

    // Resume's autoResume flag reads this var directly from the process
    // environment, so it is saved and restored here rather than trusted to
    // whatever the shell running this suite happens to have set, exactly
    // like the TUTOR_DATA_DIR guard in the mutation test below.
    const previousFlag = process.env.TUTOR_NO_AUTO_RESUME
    delete process.env.TUTOR_NO_AUTO_RESUME
    try {
      await runStartupTasks(ports, services, silent.log)
    } finally {
      if (previousFlag === undefined) delete process.env.TUTOR_NO_AUTO_RESUME
      else process.env.TUTOR_NO_AUTO_RESUME = previousFlag
      await silent.close()
    }

    expect(callOrder).toEqual(['libraryMigrator.migrate', 'bookRepository.listBooks', 'jobJournal.listInterrupted'])
  })
})
