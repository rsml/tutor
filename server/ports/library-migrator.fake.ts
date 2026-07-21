import type { LibraryMigrator, MigrationReport } from './library-migrator.js'

/**
 * A LibraryMigrator that does nothing on disk and reports whatever report
 * it was constructed with, every time migrate() is called. Its reason for
 * existing is letting a test or the e2e harness boot straight past
 * migration instead of standing up a real data directory just to satisfy
 * the port every server build now depends on.
 */
export interface FakeLibraryMigrator extends LibraryMigrator {
  /** How many times migrate() has been called, for tests that care about boot ordering. */
  readonly calls: number
}

const DEFAULT_REPORT: MigrationReport = { profile: { outcome: 'absent' }, books: [] }

export function createFakeLibraryMigrator(report: MigrationReport = DEFAULT_REPORT): FakeLibraryMigrator {
  let calls = 0

  return {
    get calls() {
      return calls
    },
    async migrate(): Promise<MigrationReport> {
      calls++
      // structuredClone so a caller mutating the returned report, or a test
      // reusing the same scripted report object across subjects, can never
      // reach back into this fake's own copy.
      return structuredClone(report)
    },
  }
}
