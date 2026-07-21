/**
 * The report a library-wide migration pass produces, and the port that
 * produces it. Run once at startup, before crash recovery, over every
 * meta.yml and the learning-profile.yml a data directory holds.
 *
 * This is a port rather than a service because migration reads below
 * BookRepository, at raw YAML that by definition does not validate under
 * the current schema, so it cannot be expressed in terms of that port.
 * ArtifactStore's recoverFromCrash() is the precedent for a startup
 * mutation method living behind a port rather than a plain function.
 *
 * migrate() never throws for a single bad book. It reports the book as
 * failed instead, because one downgraded or corrupt book must not stop a
 * whole library from booting. The per-read SchemaTooNewError guard on
 * BookRepository still makes any later direct read of that book fail
 * loudly, so nothing here weakens that protection, it only keeps one bad
 * book from taking every other book down with it.
 *
 * server/adapters/fs-library-migrator.ts is the real adapter. The
 * in-memory fake is library-migrator.fake.ts's createFakeLibraryMigrator,
 * and the shared behavioural spec both must satisfy is
 * library-migrator.contract.ts's describeLibraryMigratorContract, which
 * deliberately excludes fixture round trips, those live in the real
 * adapter's own test file, server/adapters/fs-library-migrator.test.ts.
 */

/** Why a book or the profile could not be migrated. */
export type MigrationFailure = 'unreadable' | 'too-new'

/**
 * from and to are both set and equal for a 'current' outcome, since
 * nothing was migrated. from is also set for a 'failed' outcome whenever
 * the version could at least be read, and unset only when the document
 * could not be parsed at all.
 */
export interface BookMigrationOutcome {
  bookId: string
  outcome: 'current' | 'migrated' | 'failed'
  /** The version this book was found at. Unset when the document could not even be parsed. */
  from?: number
  /** The version this book is at now, whether that took a migration or it was already current. Unset when outcome is 'failed'. */
  to?: number
  reason?: MigrationFailure
  /** A human-readable detail for a 'failed' outcome, such as a caught error's message. */
  detail?: string
}

/**
 * 'absent' is the one outcome unique to the profile, a book always has a
 * meta.yml or it would not be discovered as a book at all, see
 * BookMigrationOutcome above. It is also the only outcome that carries
 * none of from, to, reason, or detail.
 */
export interface ProfileMigrationOutcome {
  /** 'absent' means the data directory has no learning-profile.yml at all, the ordinary shape of a fresh install whose profile was never created. */
  outcome: 'absent' | 'current' | 'migrated' | 'failed'
  from?: number
  to?: number
  reason?: MigrationFailure
  detail?: string
}

/**
 * books lists exactly the subdirectories of books/ that have a meta.yml. A
 * stray subdirectory without one is not a book this pass ever reports on,
 * successfully or otherwise.
 */
export interface MigrationReport {
  profile: ProfileMigrationOutcome
  books: BookMigrationOutcome[]
}

/**
 * Safe to call more than once. A document already migrated on an earlier
 * call is simply reported 'current' the next time, never re-migrated and
 * never re-backed-up.
 */
export interface LibraryMigrator {
  migrate(): Promise<MigrationReport>
}
