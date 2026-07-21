import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createPorts, type Ports } from './composition-root.js'
import { buildServer } from './index.js'
import { createFakeDiagramRenderer } from './ports/diagram-renderer.fake.js'
import { createFakeBookRepository } from './ports/book-repository.fake.js'
import { createFakeKeyVault } from './ports/key-vault.fake.js'

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
  it('routes the mermaid renderer decoration through the overridden port', async () => {
    const diagramRenderer = createFakeDiagramRenderer()
    const fastify = await buildServer({ diagramRenderer })

    const render = (fastify as unknown as {
      mermaidRenderer: (charts: string[]) => Promise<string[]>
    }).mermaidRenderer

    const results = await render(['graph TD; A-->B'])

    expect(diagramRenderer.calls).toEqual([['graph TD; A-->B']])
    expect(results).toHaveLength(1)
    await fastify.close()
  })

  it('still builds a fully registered server when no override is given', async () => {
    const fastify = await buildServer()
    const res = await fastify.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await fastify.close()
  })
})
