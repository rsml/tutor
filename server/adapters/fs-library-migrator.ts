import { readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { CURRENT_BOOK_SCHEMA_VERSION, CURRENT_PROFILE_SCHEMA_VERSION, readSchemaVersion } from '@shared/schema-version.js'
import { migrateForward, type MigrationStep } from '../migrations/migrate.js'
import { BOOK_MIGRATIONS } from '../migrations/book/index.js'
import { PROFILE_MIGRATIONS } from '../migrations/profile/index.js'
import type {
  LibraryMigrator,
  MigrationReport,
  BookMigrationOutcome,
  ProfileMigrationOutcome,
  MigrationFailure,
} from '../ports/library-migrator.js'
import { booksDir, bookDir, writeYaml } from './fs-paths.js'

/**
 * The real LibraryMigrator adapter. Walks {dataDir}/books/learning-profile.yml
 * and every {dataDir}/books/{bookId}/meta.yml, reading each as raw,
 * unvalidated YAML rather than through BookRepository, since a v1 document
 * by definition does not parse under the current Zod schema. See the
 * port's own doc comment for why that puts this below BookRepository
 * rather than behind it.
 *
 * A document already at the current version is reported 'current' and left
 * untouched. A document behind the current version gets a one-time
 * `.bak-v{from}` backup of its exact original bytes, written only when
 * that backup does not already exist, then is overwritten in place with
 * the migrated document through the same atomic writeYaml every other
 * adapter uses. A document ahead of the current version is reported
 * 'failed' with reason 'too-new' and is never written to, matching the
 * forward-only design in server/migrations/README.md, there is no
 * downgrade path.
 *
 * Every failure handling one document is caught locally and turned into
 * that document's own 'failed' outcome. migrate() itself never rejects, so
 * one bad book can never stop the rest of the library, or the profile,
 * from migrating.
 *
 * Implements the LibraryMigrator port defined in server/ports/library-migrator.ts.
 */

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface DocumentOutcome {
  outcome: 'current' | 'migrated' | 'failed'
  from?: number
  to?: number
  reason?: MigrationFailure
  detail?: string
}

/**
 * Migrates a single YAML document in place. Shared by the profile and
 * every book, since both follow the same read, compare, backup, migrate,
 * write sequence and differ only in which version constant and migration
 * chain they use.
 */
async function migrateDocument(
  path: string,
  currentVersion: number,
  steps: readonly MigrationStep[],
): Promise<DocumentOutcome> {
  let content: string
  let raw: unknown
  try {
    content = await readFile(path, 'utf-8')
    raw = parseYaml(content)
  } catch (err) {
    return { outcome: 'failed', reason: 'unreadable', detail: messageOf(err) }
  }

  const from = readSchemaVersion(raw)

  if (from > currentVersion) {
    return { outcome: 'failed', reason: 'too-new', from }
  }
  if (from === currentVersion) {
    return { outcome: 'current', from, to: currentVersion }
  }

  try {
    const backupPath = `${path}.bak-v${from}`
    if (!existsSync(backupPath)) {
      // The exact original bytes, not a re-serialized copy, so the backup
      // stays a faithful historical record even if a future writer's YAML
      // formatting ever drifts from the reader's.
      await writeFile(backupPath, content, 'utf-8')
    }
    const migrated = migrateForward(raw, from, currentVersion, steps)
    await writeYaml(path, migrated)
    return { outcome: 'migrated', from, to: currentVersion }
  } catch (err) {
    return { outcome: 'failed', reason: 'unreadable', detail: messageOf(err) }
  }
}

async function migrateProfile(dataDir: string): Promise<ProfileMigrationOutcome> {
  const path = join(booksDir(dataDir), 'learning-profile.yml')
  if (!existsSync(path)) {
    return { outcome: 'absent' }
  }
  return migrateDocument(path, CURRENT_PROFILE_SCHEMA_VERSION, PROFILE_MIGRATIONS)
}

/**
 * Every subdirectory of books/ that has a meta.yml, in whatever order
 * readdir returns. A subdirectory with no meta.yml is not a book this
 * migrator knows how to read, and is silently ignored, the same way
 * fs-book-repository.ts's listBooks ignores one.
 */
async function listBookIds(dataDir: string): Promise<string[]> {
  const dir = booksDir(dataDir)
  if (!existsSync(dir)) return []

  const ids: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (!existsSync(join(dir, entry.name, 'meta.yml'))) continue
    ids.push(entry.name)
  }
  return ids
}

async function migrateBook(dataDir: string, bookId: string): Promise<BookMigrationOutcome> {
  const path = join(bookDir(dataDir, bookId), 'meta.yml')
  const outcome = await migrateDocument(path, CURRENT_BOOK_SCHEMA_VERSION, BOOK_MIGRATIONS)
  return { bookId, ...outcome }
}

/**
 * No I/O happens here, only closures over dataDir. That matches every
 * other adapter's factory, since createPorts constructs all of them
 * eagerly at startup, before anything is known to need migrating.
 */
export function createFsLibraryMigrator(opts: { dataDir: string }): LibraryMigrator {
  const { dataDir } = opts

  return {
    async migrate(): Promise<MigrationReport> {
      const profile = await migrateProfile(dataDir)
      const bookIds = await listBookIds(dataDir)
      const books: BookMigrationOutcome[] = []
      for (const bookId of bookIds) {
        books.push(await migrateBook(dataDir, bookId))
      }
      return { profile, books }
    },
  }
}
