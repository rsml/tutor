import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { assertSchemaVersionSupported } from '@shared/schema-version.js'

/**
 * Path and YAML helpers shared by fs-book-repository.ts and
 * fs-artifact-store.ts. Both adapters root every book under the same
 * {dataDir}/books/{bookId}/ directory and only differ in which files they
 * touch inside it, YAML metadata and Markdown for BookRepository, binary
 * artifacts for ArtifactStore, so the directory layout and the atomic YAML
 * read/write mechanics live here once instead of being duplicated in both
 * files.
 *
 * writeYaml is also used by fs-library-migrator.ts, and both readYaml and
 * writeYaml are also used by fs-job-journal.ts, each for its own file
 * layout outside {dataDir}/books/.
 *
 * A shared helper, not an adapter. It implements no port of its own, so a
 * reader looking for the interface this file satisfies will not find one
 * here.
 */

/**
 * The one place the "books" path segment is spelled. bookDir, and every
 * path fs-book-repository.ts and fs-artifact-store.ts build, come from
 * this rather than repeating the literal.
 */
export function booksDir(dataDir: string): string {
  return join(dataDir, 'books')
}

/** Guards against a bookId that would resolve outside the books directory. */
export function bookDir(dataDir: string, bookId: string): string {
  const base = booksDir(dataDir)
  const resolved = join(base, bookId)
  if (!resolved.startsWith(base + '/') && resolved !== base) {
    throw new Error('Invalid book path')
  }
  return resolved
}

/**
 * Zero-pads to at least two digits, 01 through 99. Padding only guarantees
 * a two-digit minimum, not a fixed width, so a chapter number of 100 or
 * higher would sort before 01 through 99 in a plain directory listing.
 */
export function padChapter(chapterNum: number): string {
  return String(chapterNum).padStart(2, '0')
}

/**
 * Reads and parses a YAML file, then validates it against `schema`. When
 * `opts.maxSchemaVersion` is given, the raw parsed document is checked with
 * assertSchemaVersionSupported before `schema.parse` runs. The guard sits
 * above Zod on purpose, because a file from a newer build may hold fields
 * this build's schema would silently coerce or drop, and failing loudly
 * beats mangling a user's library. Only callers that read a versioned
 * document pass the option, every other YAML the app reads has no version
 * field.
 */
export async function readYaml<T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  opts?: { maxSchemaVersion?: number },
): Promise<T> {
  const content = await readFile(path, 'utf-8')
  const data = parseYaml(content)
  if (opts?.maxSchemaVersion !== undefined) {
    assertSchemaVersionSupported(data, opts.maxSchemaVersion, path)
  }
  return schema.parse(data)
}

/** Writes YAML atomically: create the parent directory if needed, write a .tmp file, then rename it into place. */
export async function writeYaml(path: string, data: unknown): Promise<void> {
  const dir = dirname(path)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  const tmp = path + '.tmp'
  await writeFile(tmp, stringifyYaml(data), 'utf-8')
  await rename(tmp, path)
}
