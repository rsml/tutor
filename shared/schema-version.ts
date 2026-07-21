/**
 * Two independent version counters for the two things Tutor persists at the
 * top of a data directory: `meta.yml` per book, and `learning-profile.yml`
 * once per library.
 *
 * A book gets its own counter, on `meta.yml`, because a book folder is
 * portable. An EPUB import creates one from scratch, and a user can copy a
 * single book directory between machines without the rest of the library.
 * Whatever schema shape it is written in has to travel with it, not live in
 * a separate library-wide file the folder might arrive without.
 *
 * The profile gets its own counter, on `learning-profile.yml`, because a
 * profile exists before any book does. A fresh install has a profile and
 * zero books, so tying its version to a book, or to a library-wide file
 * that only makes sense once a book exists, would leave it unversioned at
 * exactly the moment versioning matters most, first boot.
 *
 * Absent field means version 1. Every build before this one wrote `meta.yml`
 * and `learning-profile.yml` with no `schemaVersion` key at all, so "the key
 * is missing" is not corruption, it is simply the oldest possible file.
 */

export const CURRENT_BOOK_SCHEMA_VERSION = 2
export const CURRENT_PROFILE_SCHEMA_VERSION = 2

/**
 * Reads `schemaVersion` off a raw, not-yet-validated YAML document. Used
 * below its matching Zod schema on purpose, migration has to know a file's
 * version before that file can be trusted to parse.
 *
 * A missing field, a non-object, a non-numeric value, and a negative value
 * all read as 1. The first two are the documented "nothing has ever
 * written a version here" case. The last two are deliberately treated the
 * same way rather than rejected: a garbage value cannot be a version this
 * app ever wrote, and reading it as 1 routes the file through every
 * migration step as a repair attempt. Migration steps are safe to run
 * against a file that never needed them, so this favors an attempted
 * repair over refusing to boot on a field that was never going to be
 * trustworthy anyway.
 */
export function readSchemaVersion(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return 1
  const value = (raw as { schemaVersion?: unknown }).schemaVersion
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 1
  return value
}

/**
 * Thrown when a file's schema version is newer than this build supports,
 * meaning the library was written by a newer release and the app was
 * downgraded, or pointed at someone else's newer data directory. `found`
 * and `supported` let a caller report the exact gap rather than a generic
 * parse failure, and `path` names the offending file when the caller has
 * one, so the message points at something fixable instead of just failing.
 */
export class SchemaTooNewError extends Error {
  readonly found: number
  readonly supported: number
  readonly path?: string

  constructor(found: number, supported: number, path?: string) {
    const location = path ? ` (${path})` : ''
    super(
      `Schema version ${found}${location} is newer than this build supports (up to ${supported}). ` +
        'Update the app to read this library.',
    )
    this.name = 'SchemaTooNewError'
    this.found = found
    this.supported = supported
    this.path = path
  }
}

/**
 * Guards a read: no-op when the raw document's version is at or below what
 * this build supports, otherwise throws SchemaTooNewError. Deliberately
 * separate from readSchemaVersion so a caller that only wants the number,
 * such as a migration step choosing where to start, never has to catch an
 * exception to get it.
 */
export function assertSchemaVersionSupported(raw: unknown, supported: number, path?: string): void {
  const found = readSchemaVersion(raw)
  if (found > supported) {
    throw new SchemaTooNewError(found, supported, path)
  }
}
