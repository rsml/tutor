import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { BookMeta, LearningProfile } from '@shared/domain.js'
import { SchemaTooNewError } from '@shared/schema-version.js'
import type { BookRepository } from '../ports/book-repository.js'
import { describeBookRepositoryContract } from '../ports/book-repository.contract.js'
import { createFsBookRepository } from './fs-book-repository.js'

// Runs the shared BookRepository contract against the real filesystem
// adapter, over a fresh temp directory per subject so a failing assertion
// never touches, and this suite never even risks touching, the real data
// directory a running app would use.

const tempDirs: string[] = []

async function makeSubject(): Promise<BookRepository> {
  const dataDir = await mkdtemp(join(tmpdir(), 'tutor-fs-book-repository-test-'))
  tempDirs.push(dataDir)
  return createFsBookRepository({ dataDir })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describeBookRepositoryContract('real fs adapter', makeSubject)

// --- Schema version stamping on write, and guarding on read. Whitebox,
// not part of the shared BookRepository contract, since the fake has
// nothing on disk to stamp or guard. ---

function makeBookMeta(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Test Book',
    prompt: 'Teach me testing',
    status: 'reading',
    totalChapters: 3,
    generatedUpTo: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }
}

function makeProfile(overrides: Partial<LearningProfile> = {}): LearningProfile {
  return {
    style: 'mental models',
    identity: 'developer',
    preferences: {
      explainComplexTermsSimply: true,
      codeExamples: true,
      realWorldAnalogies: true,
      includeRecaps: true,
      includeSummaries: true,
      visualDescriptions: false,
      depthLevel: 3,
      pacePreference: 3,
      metaphorDensity: 3,
      narrativeStyle: 3,
      humorLevel: 3,
      formalityLevel: 3,
    },
    skills: [],
    ...overrides,
  }
}

describe('schema version stamping and guarding', () => {
  let dataDir: string
  let repo: BookRepository

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'tutor-fs-book-repository-version-test-'))
    repo = createFsBookRepository({ dataDir })
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('stamps a saved book meta.yml with the current schema version', async () => {
    await repo.saveBook(makeBookMeta({ id: 'stamped-book' }))

    const raw = parseYaml(await readFile(join(dataDir, 'books', 'stamped-book', 'meta.yml'), 'utf-8')) as {
      schemaVersion?: number
    }
    expect(raw.schemaVersion).toBe(2)
  })

  it('stamps a saved learning-profile.yml with the current schema version', async () => {
    await repo.saveProfile(makeProfile())

    const raw = parseYaml(await readFile(join(dataDir, 'books', 'learning-profile.yml'), 'utf-8')) as {
      schemaVersion?: number
    }
    expect(raw.schemaVersion).toBe(2)
  })

  it('rejects getBook with SchemaTooNewError when meta.yml is newer than this build supports', async () => {
    const dir = join(dataDir, 'books', 'too-new-book')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'meta.yml'),
      stringifyYaml({ ...makeBookMeta({ id: 'too-new-book' }), schemaVersion: 99 }),
      'utf-8',
    )

    let thrown: unknown
    try {
      await repo.getBook('too-new-book')
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(SchemaTooNewError)
    expect((thrown as SchemaTooNewError).found).toBe(99)
    expect((thrown as SchemaTooNewError).supported).toBe(2)
  })

  it('still resolves getBook when meta.yml has no schemaVersion at all, since that is simply the oldest possible file', async () => {
    const dir = join(dataDir, 'books', 'unmigrated-book')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'meta.yml'), stringifyYaml(makeBookMeta({ id: 'unmigrated-book' })), 'utf-8')

    await expect(repo.getBook('unmigrated-book')).resolves.toMatchObject({ id: 'unmigrated-book' })
  })

  it('skips a too-new book in listBooks rather than throwing', async () => {
    await repo.saveBook(makeBookMeta({ id: 'good-book' }))

    // listBooks does not pass maxSchemaVersion through to readYaml (see
    // fs-book-repository.ts), so what has to catch this book is the same
    // pre-existing per-book try/catch that already skips any book it
    // cannot parse. The invalid status stands in for a field shape only a
    // newer build would write.
    const badDir = join(dataDir, 'books', 'too-new-book')
    await mkdir(badDir, { recursive: true })
    await writeFile(
      join(badDir, 'meta.yml'),
      stringifyYaml({ ...makeBookMeta({ id: 'too-new-book' }), schemaVersion: 99, status: 'not-a-real-status' }),
      'utf-8',
    )

    const books = await repo.listBooks()
    expect(books.map((b) => b.id)).toEqual(['good-book'])
  })
})
