import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { LibraryMigrator } from '../ports/library-migrator.js'
import { describeLibraryMigratorContract } from '../ports/library-migrator.contract.js'
import { createFsLibraryMigrator } from './fs-library-migrator.js'

// The real LibraryMigrator adapter, proven against committed fixture
// libraries frozen at schema version 1 (see server/migrations/__fixtures__/
// and its README). Every test copies a fixture into a fresh mkdtemp()
// before migrating it, so the committed fixture is never mutated and every
// assertion runs against real files rather than an in-memory mock of a
// filesystem.

const FIXTURES_DIR = fileURLToPath(new URL('../migrations/__fixtures__/', import.meta.url))

const tempDirs: string[] = []

async function freshDataDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tutor-fs-library-migrator-test-'))
  tempDirs.push(dir)
  return dir
}

async function copyRecursive(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyRecursive(from, to)
    } else {
      await copyFile(from, to)
    }
  }
}

/** Copies a named fixture (see __fixtures__/README.md) into a fresh temp data directory and returns its path. */
async function copyFixture(name: string): Promise<string> {
  const dest = await freshDataDir()
  await copyRecursive(join(FIXTURES_DIR, name), dest)
  return dest
}

async function readRawYaml(path: string): Promise<Record<string, unknown>> {
  return parseYaml(await readFile(path, 'utf-8')) as Record<string, unknown>
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function makeSubject(): Promise<LibraryMigrator> {
  const dataDir = await freshDataDir()
  return createFsLibraryMigrator({ dataDir })
}

describeLibraryMigratorContract('real fs adapter', makeSubject)

describe('createFsLibraryMigrator', () => {
  it('reports an absent profile and no books for an empty data directory, without throwing', async () => {
    const dataDir = await freshDataDir()
    const migrator = createFsLibraryMigrator({ dataDir })

    const report = await migrator.migrate()

    expect(report).toEqual({ profile: { outcome: 'absent' }, books: [] })
  })

  it('migrates v1-library end to end, materializing defaults while preserving every existing value', async () => {
    const dataDir = await copyFixture('v1-library')
    const migrator = createFsLibraryMigrator({ dataDir })

    const report = await migrator.migrate()

    expect(report.profile).toMatchObject({ outcome: 'migrated', from: 1, to: 2 })
    expect(report.books).toHaveLength(2)
    expect(report.books).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bookId: 'consensus-protocols', outcome: 'migrated', from: 1, to: 2 }),
        expect.objectContaining({ bookId: 'vector-clocks', outcome: 'migrated', from: 1, to: 2 }),
      ]),
    )

    const consensus = await readRawYaml(join(dataDir, 'books', 'consensus-protocols', 'meta.yml'))
    expect(consensus.schemaVersion).toBe(2)
    expect(consensus.tags).toEqual([])
    expect(consensus.audioGeneratedChapters).toEqual([])
    expect(consensus.rating).toBe(4.5)

    const vectorClocks = await readRawYaml(join(dataDir, 'books', 'vector-clocks', 'meta.yml'))
    expect(vectorClocks.schemaVersion).toBe(2)
    expect(vectorClocks.tags).toEqual([])
    expect(vectorClocks.audioGeneratedChapters).toEqual([])
    expect(vectorClocks.series).toBe('Distributed Systems')

    const profile = await readRawYaml(join(dataDir, 'books', 'learning-profile.yml'))
    expect(profile.schemaVersion).toBe(2)
    expect(profile.skills).toEqual([])
  })

  it('writes a one-time .bak-v1 backup beside each migrated file, holding the original unmigrated document', async () => {
    const dataDir = await copyFixture('v1-library')
    const migrator = createFsLibraryMigrator({ dataDir })

    await migrator.migrate()

    const bookBackup = await readRawYaml(join(dataDir, 'books', 'consensus-protocols', 'meta.yml.bak-v1'))
    expect(bookBackup.schemaVersion).toBeUndefined()
    expect(bookBackup.tags).toBeUndefined()
    expect(bookBackup.id).toBe('consensus-protocols')

    const profileBackup = await readRawYaml(join(dataDir, 'books', 'learning-profile.yml.bak-v1'))
    expect(profileBackup.schemaVersion).toBeUndefined()
    expect(profileBackup.skills).toBeUndefined()
  })

  it('is idempotent: a second run reports everything current, and never overwrites an existing backup', async () => {
    const dataDir = await copyFixture('v1-library')
    const migrator = createFsLibraryMigrator({ dataDir })
    await migrator.migrate()

    const bookBackupPath = join(dataDir, 'books', 'consensus-protocols', 'meta.yml.bak-v1')
    const profileBackupPath = join(dataDir, 'books', 'learning-profile.yml.bak-v1')
    const bookBackupAfterFirstRun = await readFile(bookBackupPath, 'utf-8')
    const profileBackupAfterFirstRun = await readFile(profileBackupPath, 'utf-8')

    const second = await migrator.migrate()

    expect(second.profile.outcome).toBe('current')
    expect(second.books).toHaveLength(2)
    for (const book of second.books) {
      expect(book.outcome).toBe('current')
    }

    expect(await readFile(bookBackupPath, 'utf-8')).toBe(bookBackupAfterFirstRun)
    expect(await readFile(profileBackupPath, 'utf-8')).toBe(profileBackupAfterFirstRun)
  })

  it('migrates v1-profile-only: the profile migrates and the book list is empty', async () => {
    const dataDir = await copyFixture('v1-profile-only')
    const migrator = createFsLibraryMigrator({ dataDir })

    const report = await migrator.migrate()

    expect(report.profile).toMatchObject({ outcome: 'migrated', from: 1, to: 2 })
    expect(report.books).toEqual([])
  })

  it('migrates v1-corrupt-book: the readable book migrates, the truncated one fails as unreadable, and migrate() itself does not throw', async () => {
    const dataDir = await copyFixture('v1-corrupt-book')
    const migrator = createFsLibraryMigrator({ dataDir })

    const report = await migrator.migrate()

    expect(report.profile.outcome).toBe('absent')

    const readable = report.books.find((b) => b.bookId === 'readable-book')
    expect(readable).toMatchObject({ outcome: 'migrated', from: 1, to: 2 })

    const truncated = report.books.find((b) => b.bookId === 'truncated-book')
    expect(truncated?.outcome).toBe('failed')
    expect(truncated?.reason).toBe('unreadable')
    expect(truncated?.detail).toBeTruthy()
  })

  it('reports a too-new book as failed without touching its file, while a sibling v1 book in the same library still migrates', async () => {
    const dataDir = await copyFixture('v1-library')

    const tooNewDir = join(dataDir, 'books', 'too-new-book')
    await mkdir(tooNewDir, { recursive: true })
    const tooNewContent = stringifyYaml({
      id: 'too-new-book',
      title: 'From The Future',
      prompt: 'Whatever a much later build writes here.',
      status: 'reading',
      totalChapters: 1,
      generatedUpTo: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      schemaVersion: 99,
    })
    await writeFile(join(tooNewDir, 'meta.yml'), tooNewContent, 'utf-8')

    const migrator = createFsLibraryMigrator({ dataDir })
    const report = await migrator.migrate()

    const tooNew = report.books.find((b) => b.bookId === 'too-new-book')
    expect(tooNew).toMatchObject({ outcome: 'failed', reason: 'too-new' })
    expect(await readFile(join(tooNewDir, 'meta.yml'), 'utf-8')).toBe(tooNewContent)

    const sibling = report.books.find((b) => b.bookId === 'consensus-protocols')
    expect(sibling).toMatchObject({ outcome: 'migrated', from: 1, to: 2 })
  })

  it('ignores a directory under books/ that has no meta.yml', async () => {
    const dataDir = await copyFixture('v1-library')
    await mkdir(join(dataDir, 'books', 'not-a-book'), { recursive: true })
    await writeFile(join(dataDir, 'books', 'not-a-book', 'notes.txt'), 'stray file, not a book', 'utf-8')

    const migrator = createFsLibraryMigrator({ dataDir })
    const report = await migrator.migrate()

    expect(report.books.map((b) => b.bookId)).not.toContain('not-a-book')
    expect(report.books).toHaveLength(2)
  })
})
