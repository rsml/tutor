import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createPorts, type Ports } from './composition-root.js'
import { buildServer } from './index.js'
import { createFakeDiagramRenderer } from './ports/diagram-renderer.fake.js'
import { createFakeBookRepository } from './ports/book-repository.fake.js'
import { createFakeKeyVault } from './ports/key-vault.fake.js'
import { createFakeTextGeneration } from './ports/text-generation.fake.js'

/**
 * The composition root is the only module that names a concrete adapter, so
 * these tests are about wiring rather than behaviour. They pin the two
 * things the rest of the phase depends on: that every port is present, and
 * that an override reaches the running server.
 */

const PORT_NAMES: Array<keyof Ports> = [
  'bookRepository',
  'artifactStore',
  'keyVault',
  'textGeneration',
  'imageGeneration',
  'speechSynthesis',
  'audioAssembly',
  'diagramRenderer',
  'epubImport',
  'epubExport',
  'backgroundTasks',
  'clock',
  'osFileManager',
]

describe('createPorts', () => {
  it('builds every port, so consumers never have to null check one', () => {
    const ports = createPorts()
    for (const name of PORT_NAMES) {
      expect(ports[name], `${name} was missing`).toBeDefined()
    }
  })

  it('has no port beyond the declared set, so a stray field cannot go unnoticed', () => {
    expect(Object.keys(createPorts()).sort()).toEqual([...PORT_NAMES].sort())
  })

  it('replaces an overridden port with exactly the object it was given', () => {
    const bookRepository = createFakeBookRepository()
    const ports = createPorts({ bookRepository })
    expect(ports.bookRepository).toBe(bookRepository)
  })

  it('leaves every other port real when one is overridden', () => {
    const diagramRenderer = createFakeDiagramRenderer()
    const ports = createPorts({ diagramRenderer })
    expect(ports.diagramRenderer).toBe(diagramRenderer)
    expect(ports.bookRepository).toBeDefined()
    expect(ports.textGeneration).toBeDefined()
  })

  it('builds fresh adapters per call, so two servers never share mutable state', () => {
    expect(createPorts().backgroundTasks).not.toBe(createPorts().backgroundTasks)
  })

  it('hands an overridden key vault to the AI adapter rather than a second real one', async () => {
    // The AI and image adapters read API keys through the vault, so an
    // override has to reach them too. Otherwise a test that redirected the
    // vault would still have those two consulting the real one on disk.
    // The proof is that generateObject fails with the fake vault's empty
    // answer, which happens while resolving the model and before any
    // request could be made, so nothing here touches the network.
    const keyVault = createFakeKeyVault()
    const { textGeneration } = createPorts({ keyVault })

    await expect(
      textGeneration.generateObject({
        model: { provider: 'anthropic', model: 'claude-test-model' },
        schema: z.object({ answer: z.string() }),
        prompt: 'never sent',
      }),
    ).rejects.toThrow(/No API key configured/)
  })
})

describe('buildServer overrides', () => {
  // Proof that an override reaches a route rather than just createPorts'
  // own return value lives in the 'leaves every other port real when one is
  // overridden' case above, which already uses diagramRenderer as its
  // example. buildServer registers every route plugin with the exact same
  // ports object createPorts returned, so there is no separate wiring step
  // here left to pin.

  it('still builds a fully registered server when no override is given', async () => {
    const fastify = await buildServer()
    const res = await fastify.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await fastify.close()
  })
})

describe('shared services', () => {
  // The regression this guards against: server/routes/generation.ts and
  // server/routes/library.ts used to share one ChapterGenerationStream
  // through a module-scope registry (generation-manager.ts). Now both read
  // services.chapterGenerationStream, built once in createSharedServices and
  // passed into every route plugin alongside ports. If a future change ever
  // gave one of the two route modules its own separately-built stream
  // instead, generation.ts would still drive a generation to completion,
  // but library.ts would report it as never having started.
  it('generation.ts and library.ts observe the same ChapterGenerationStream instance', async () => {
    const bookRepository = createFakeBookRepository()
    await bookRepository.saveBook({
      id: 'shared-stream-book',
      title: 'Shared Stream Book',
      prompt: 'Prove the two routes share one generation stream',
      status: 'reading',
      totalChapters: 1,
      generatedUpTo: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      audioGeneratedChapters: [],
    })
    await bookRepository.saveToc('shared-stream-book', { chapters: [{ title: 'Chapter One', description: 'd' }] })

    const textGeneration = createFakeTextGeneration()
    textGeneration.scriptStreamText(['Chapter text.'])
    // Quiz generation is a non-fatal side effect of generating a chapter
    // (see generate-next-chapter.ts); scripting it too just keeps this
    // test's output free of its otherwise-harmless "no response queued" log.
    textGeneration.scriptGenerateObject({ questions: [] })

    const fastify = await buildServer({ bookRepository, textGeneration })

    // Drive a generation through generation.ts's route. inject() resolves
    // once the SSE stream's terminal event is written, so by the time this
    // await returns, the shared hub has moved this book to its 'done' stage.
    const genRes = await fastify.inject({
      method: 'POST',
      url: '/api/books/shared-stream-book/generate-next',
      payload: { model: 'claude-sonnet-4-6' },
    })
    expect(genRes.statusCode).toBe(200)

    // library.ts's GET /api/books/:id reads services.chapterGenerationStream
    // too, so it must observe the run generation.ts just drove rather than
    // an independent, always-inactive instance of its own.
    const bookRes = await fastify.inject({ method: 'GET', url: '/api/books/shared-stream-book' })
    expect(bookRes.statusCode).toBe(200)
    expect(bookRes.json().generation).toMatchObject({ active: true, stage: 'done', chapterNum: 1 })

    await fastify.close()
  })
})
