import { describe, it, expect } from 'vitest'
import { migrateForward, assertChainIntegrity, type MigrationStep } from './migrate.js'

// Pure chain mechanics shared by every migration chain (book, profile, and
// whatever is added later). Exercised here with synthetic steps rather than
// the real ones, so a bug in a real migration's field logic can never hide
// a bug in the chain-walking logic underneath it, and vice versa.

function markerStep(to: number, name: string): MigrationStep {
  return {
    to,
    name,
    migrate(raw) {
      const applied = Array.isArray(raw.applied) ? raw.applied : []
      return { ...raw, applied: [...applied, name] }
    },
  }
}

const STEPS: readonly MigrationStep[] = [markerStep(2, 'a'), markerStep(3, 'b'), markerStep(4, 'c')]

describe('migrateForward', () => {
  it('applies exactly the steps whose `to` is greater than `from` and at most `to`, in array order', () => {
    const result = migrateForward({ x: 1 }, 2, 4, STEPS)
    // step "a" (to: 2) is skipped: 2 is not greater than from (2)
    expect(result.applied).toEqual(['b', 'c'])
  })

  it('returns a record stamped with schemaVersion: to', () => {
    const result = migrateForward({ x: 1 }, 1, 4, STEPS)
    expect(result.schemaVersion).toBe(4)
  })

  it('applies no step and still stamps the version when from === to', () => {
    const result = migrateForward({ x: 1 }, 3, 3, STEPS)
    expect(result.applied).toBeUndefined()
    expect(result.schemaVersion).toBe(3)
    expect(result.x).toBe(1)
  })

  it('throws rather than migrating backward when from > to', () => {
    expect(() => migrateForward({ x: 1 }, 3, 2, STEPS)).toThrow()
  })

  it('throws a clear error naming the problem when raw is not a plain object', () => {
    expect(() => migrateForward(null, 1, 2, STEPS)).toThrow(/null/i)
    expect(() => migrateForward(['array'], 1, 2, STEPS)).toThrow(/array/i)
    expect(() => migrateForward('a string', 1, 2, STEPS)).toThrow(/string/i)
    expect(() => migrateForward(42, 1, 2, STEPS)).toThrow(/number/i)
  })

  it('does not mutate the input object', () => {
    // This matters because the real migrator holds onto the pre-migration
    // value so it can write it out as a one-time backup file.
    const raw = { x: 1, nested: { y: 2 } }
    const snapshotBefore = structuredClone(raw)
    migrateForward(raw, 1, 4, STEPS)
    expect(raw).toEqual(snapshotBefore)
  })
})

describe('assertChainIntegrity', () => {
  it('passes for a contiguous chain whose length is currentVersion - 1 and whose `to` values count up from 2', () => {
    expect(() => assertChainIntegrity(STEPS, 4, 'test-chain')).not.toThrow()
  })

  it('throws, naming the label, when a step is missing from the middle', () => {
    const gappy = [markerStep(2, 'a'), markerStep(4, 'c')]
    expect(() => assertChainIntegrity(gappy, 4, 'test-chain')).toThrow(/test-chain/)
  })

  it('throws, naming the label, when `to` values are out of order', () => {
    const outOfOrder = [markerStep(3, 'b'), markerStep(2, 'a')]
    expect(() => assertChainIntegrity(outOfOrder, 3, 'test-chain')).toThrow(/test-chain/)
  })

  it('throws, naming the label, when `to` values are duplicated', () => {
    const duplicated = [markerStep(2, 'a'), markerStep(2, 'a-again')]
    expect(() => assertChainIntegrity(duplicated, 3, 'test-chain')).toThrow(/test-chain/)
  })

  it('throws, naming the label, when the chain length disagrees with currentVersion', () => {
    expect(() => assertChainIntegrity(STEPS, 10, 'test-chain')).toThrow(/test-chain/)
  })
})
