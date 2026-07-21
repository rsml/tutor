import { describe, it, expect } from 'vitest'
import {
  CURRENT_BOOK_SCHEMA_VERSION,
  CURRENT_PROFILE_SCHEMA_VERSION,
  readSchemaVersion,
  assertSchemaVersionSupported,
  SchemaTooNewError,
} from './schema-version.js'

// Pure version reading and guarding, no I/O and no zod. Every migration
// chain and every future read-side guard shares this one reading of "how
// old is this file," so it is tested here in isolation from both.

describe('CURRENT_BOOK_SCHEMA_VERSION and CURRENT_PROFILE_SCHEMA_VERSION', () => {
  it('are both 2, matching the one shipped migration per chain', () => {
    expect(CURRENT_BOOK_SCHEMA_VERSION).toBe(2)
    expect(CURRENT_PROFILE_SCHEMA_VERSION).toBe(2)
  })
})

describe('readSchemaVersion', () => {
  it('reads an absent field as version 1', () => {
    expect(readSchemaVersion({})).toBe(1)
    expect(readSchemaVersion({ id: 'book-1', title: 'Untitled' })).toBe(1)
  })

  it('reads a non-object as version 1', () => {
    expect(readSchemaVersion(null)).toBe(1)
    expect(readSchemaVersion(undefined)).toBe(1)
    expect(readSchemaVersion('v1')).toBe(1)
    expect(readSchemaVersion(42)).toBe(1)
    expect(readSchemaVersion(['not', 'a', 'record'])).toBe(1)
  })

  it('reads a numeric field as itself', () => {
    expect(readSchemaVersion({ schemaVersion: 1 })).toBe(1)
    expect(readSchemaVersion({ schemaVersion: 2 })).toBe(2)
    expect(readSchemaVersion({ schemaVersion: 99 })).toBe(99)
  })

  it('reads a non-numeric field as version 1', () => {
    expect(readSchemaVersion({ schemaVersion: '2' })).toBe(1)
    expect(readSchemaVersion({ schemaVersion: null })).toBe(1)
    expect(readSchemaVersion({ schemaVersion: {} })).toBe(1)
    expect(readSchemaVersion({ schemaVersion: [2] })).toBe(1)
  })

  it('reads a negative field as version 1, on the theory that a garbage version is ancient rather than a reason to refuse to boot', () => {
    // A negative (or otherwise nonsensical) value is never one this app
    // wrote. Reading it as 1 sends it through every migration step, which
    // is a repair attempt; the steps are safe to run against a file that
    // never needed them. The alternative, refusing to boot, would turn one
    // corrupt field into a hard outage for no benefit.
    expect(readSchemaVersion({ schemaVersion: -1 })).toBe(1)
    expect(readSchemaVersion({ schemaVersion: -99 })).toBe(1)
  })
})

describe('assertSchemaVersionSupported', () => {
  it('is a no-op at or below the supported version', () => {
    expect(() => assertSchemaVersionSupported({}, 2)).not.toThrow()
    expect(() => assertSchemaVersionSupported({ schemaVersion: 1 }, 2)).not.toThrow()
    expect(() => assertSchemaVersionSupported({ schemaVersion: 2 }, 2)).not.toThrow()
  })

  it('throws SchemaTooNewError when the found version exceeds supported', () => {
    expect(() => assertSchemaVersionSupported({ schemaVersion: 3 }, 2)).toThrow(SchemaTooNewError)
  })

  it('carries found, supported, and path on the thrown error', () => {
    let thrown: unknown
    try {
      assertSchemaVersionSupported({ schemaVersion: 5 }, 2, '/data/books/some-book/meta.yml')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(SchemaTooNewError)
    const error = thrown as SchemaTooNewError
    expect(error.found).toBe(5)
    expect(error.supported).toBe(2)
    expect(error.path).toBe('/data/books/some-book/meta.yml')
  })

  it('leaves path undefined when the caller does not have one', () => {
    let thrown: unknown
    try {
      assertSchemaVersionSupported({ schemaVersion: 5 }, 2)
    } catch (error) {
      thrown = error
    }
    expect((thrown as SchemaTooNewError).path).toBeUndefined()
  })
})
