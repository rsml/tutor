/**
 * Chain mechanics shared by every migration chain (book, profile, and
 * whatever is added later). A MigrationStep is a pure function from one
 * schema version's raw shape to the next; this module knows nothing about
 * what a book or a profile looks like, only how to walk an ordered list of
 * such steps and how to prove that list is complete.
 *
 * Pure by construction, no fs, no yaml parsing, no knowledge of where the
 * raw data came from or where the result goes. The I/O half, reading a
 * file, calling migrateForward, and writing the result plus a one-time
 * backup, is a later task's LibraryMigrator port.
 */

export interface MigrationStep {
  /** The schema version this step produces. The first step in any chain is 2, since 1 is defined as "no migration has ever run." */
  readonly to: number
  /** A short, stable identifier for logging and for naming in error messages, e.g. '001-materialize-defaults'. */
  readonly name: string
  /** Pure: takes the raw record at `to - 1` and returns the raw record at `to`. Must not mutate its argument. */
  migrate(raw: Record<string, unknown>): Record<string, unknown>
}

function describeType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return `a ${typeof value}`
}

/**
 * Runs every step whose `to` falls in the (from, to] range, in array order,
 * over a shallow copy of `raw`, then stamps the result with the target
 * version. Copying `raw` up front, rather than trusting each step not to
 * mutate its argument, is what lets migrateForward promise its own input is
 * untouched regardless of how a step is written: the real caller keeps the
 * pre-migration value around to write out as a `.bak` file, so this
 * function can never be the thing that corrupts that backup.
 */
export function migrateForward(
  raw: unknown,
  from: number,
  to: number,
  steps: readonly MigrationStep[],
): Record<string, unknown> {
  if (from > to) {
    throw new Error(`Cannot migrate backward from version ${from} to version ${to}.`)
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`Cannot migrate ${describeType(raw)}: expected a plain object.`)
  }

  let current: Record<string, unknown> = { ...(raw as Record<string, unknown>) }
  for (const step of steps) {
    if (step.to > from && step.to <= to) {
      current = step.migrate(current)
    }
  }
  return { ...current, schemaVersion: to }
}

/**
 * Fails the build, not just a boot, when a chain is missing a step, has a
 * step out of order or duplicated, or disagrees in length with the current
 * version constant. This is what turns "bumped CURRENT_BOOK_SCHEMA_VERSION
 * and forgot to write the migration" into a test failure instead of a
 * library nobody can read. `label` is threaded into every message so a
 * failure names which chain, book, profile, or a future one, is broken.
 */
export function assertChainIntegrity(
  steps: readonly MigrationStep[],
  currentVersion: number,
  label: string,
): void {
  const expectedLength = currentVersion - 1
  if (steps.length !== expectedLength) {
    throw new Error(
      `${label} migration chain has ${steps.length} step(s) but CURRENT version ${currentVersion} requires exactly ${expectedLength}. Did you bump the version constant without adding a step, or add a step without bumping it?`,
    )
  }
  steps.forEach((step, index) => {
    const expectedTo = index + 2
    if (step.to !== expectedTo) {
      throw new Error(
        `${label} migration chain is broken at index ${index}: step "${step.name}" produces version ${step.to}, but a contiguous chain requires ${expectedTo} at this position.`,
      )
    }
  })
}
