import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/**
 * Path and YAML helpers shared by fs-book-repository.ts and
 * fs-artifact-store.ts. Both adapters root every book under the same
 * {dataDir}/books/{bookId}/ directory and only differ in which files they
 * touch inside it, YAML metadata and Markdown for BookRepository, binary
 * artifacts for ArtifactStore, so the directory layout and the atomic YAML
 * read/write mechanics live here once instead of being duplicated in both
 * files.
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

export function padChapter(chapterNum: number): string {
  return String(chapterNum).padStart(2, '0')
}

export async function readYaml<T>(path: string, schema: { parse: (data: unknown) => T }): Promise<T> {
  const content = await readFile(path, 'utf-8')
  const data = parseYaml(content)
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
