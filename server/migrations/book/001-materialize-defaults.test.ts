import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { describe, it, expect } from 'vitest'
import { BookMetaSchema } from '@shared/domain.js'
import { materializeBookDefaults } from './001-materialize-defaults.js'

// Exercised against the real, committed v1 fixtures rather than an inline
// stand-in, so this proves the step against bytes an actual released build
// once wrote, not against a shape a test author guessed at. See
// server/migrations/__fixtures__/README.md. Read raw with the same two
// primitives the fixtures README promises callers will use: node:fs and the
// yaml package, never readYaml, which is the I/O half's job and belongs to
// a later task.

async function readRawFixture(relativePathUnderFixtures: string): Promise<Record<string, unknown>> {
  const url = new URL(`../__fixtures__/${relativePathUnderFixtures}`, import.meta.url)
  const content = await readFile(fileURLToPath(url), 'utf-8')
  return parseYaml(content)
}

describe('materializeBookDefaults', () => {
  it('is a step that produces schema version 2', () => {
    expect(materializeBookDefaults.to).toBe(2)
  })

  it('materializes tags and audioGeneratedChapters onto consensus-protocols while preserving its fields', async () => {
    const raw = await readRawFixture('v1-library/books/consensus-protocols/meta.yml')
    const result = materializeBookDefaults.migrate(raw)

    expect(result.tags).toEqual([])
    expect(result.audioGeneratedChapters).toEqual([])

    // Fields only this fixture has, spelled out explicitly.
    expect(result.rating).toBe(4.5)
    expect(result.finalQuizScore).toBe(8)
    expect(result.finalQuizTotal).toBe(10)

    // The rest of the fixture, untouched.
    expect(result.id).toBe('consensus-protocols')
    expect(result.title).toBe('Consensus Protocols')
    expect(result.subtitle).toBe('From Two Generals to Raft')
    expect(result.prompt).toBe(
      'Teach me how distributed consensus actually works, building up from first principles.',
    )
    expect(result.status).toBe('complete')
    expect(result.totalChapters).toBe(2)
    expect(result.generatedUpTo).toBe(2)
    expect(result.createdAt).toBe('2025-11-02T09:14:03.221Z')
    expect(result.updatedAt).toBe('2025-11-02T10:41:55.807Z')
  })

  it('materializes tags and audioGeneratedChapters onto vector-clocks while preserving its series fields', async () => {
    const raw = await readRawFixture('v1-library/books/vector-clocks/meta.yml')
    const result = materializeBookDefaults.migrate(raw)

    expect(result.tags).toEqual([])
    expect(result.audioGeneratedChapters).toEqual([])

    expect(result.series).toBe('Distributed Systems')
    expect(result.seriesOrder).toBe(2)
    expect(result.sortOrder).toBe(10)

    expect(result.id).toBe('vector-clocks')
    expect(result.status).toBe('reading')
    expect(result.generatedUpTo).toBe(1)
  })

  it('never clobbers an already-populated tags value', () => {
    const raw = { id: 'has-tags', tags: ['distributed-systems'], audioGeneratedChapters: [1] }
    const result = materializeBookDefaults.migrate(raw)
    expect(result.tags).toEqual(['distributed-systems'])
    expect(result.audioGeneratedChapters).toEqual([1])
  })

  it('produces output that parses cleanly under BookMetaSchema', async () => {
    const raw = await readRawFixture('v1-library/books/consensus-protocols/meta.yml')
    const result = materializeBookDefaults.migrate(raw)
    expect(() => BookMetaSchema.parse(result)).not.toThrow()
  })
})
