import { describe, it, expect } from 'vitest'
import type { LibraryMigrator, MigrationReport } from './library-migrator.js'

/**
 * The behavioural specification every LibraryMigrator must satisfy,
 * whether it is the in-memory fake or the real filesystem adapter. Covers
 * only what both can satisfy, that a report is well formed and that a
 * second call is safe.
 *
 * Fixture round trips are deliberately not part of this contract. The fake
 * has no filesystem to migrate anything on, so an assertion about what
 * changed on disk after migrating a specific fixture library can only ever
 * run against the real adapter, and lives in that adapter's own test file
 * instead, server/adapters/fs-library-migrator.test.ts.
 */

const PROFILE_OUTCOMES = ['absent', 'current', 'migrated', 'failed']
const BOOK_OUTCOMES = ['current', 'migrated', 'failed']

function assertWellFormed(report: MigrationReport): void {
  expect(PROFILE_OUTCOMES).toContain(report.profile.outcome)
  expect(Array.isArray(report.books)).toBe(true)
  for (const book of report.books) {
    expect(typeof book.bookId).toBe('string')
    expect(book.bookId.length).toBeGreaterThan(0)
    expect(BOOK_OUTCOMES).toContain(book.outcome)
  }
}

export function describeLibraryMigratorContract(
  label: string,
  makeSubject: () => LibraryMigrator | Promise<LibraryMigrator>,
): void {
  describe(`LibraryMigrator contract (${label})`, () => {
    it('resolves to a well-formed report', async () => {
      const subject = await makeSubject()
      const report = await subject.migrate()
      assertWellFormed(report)
    })

    it('is safe to call twice in a row, and the second call still resolves to a well-formed report', async () => {
      const subject = await makeSubject()
      await subject.migrate()
      const second = await subject.migrate()
      assertWellFormed(second)
    })
  })
}
