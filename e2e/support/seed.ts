import { randomUUID } from 'node:crypto'
import type { BookMeta, Quiz } from '@shared/domain.js'
import { createFsBookRepository } from '@server/adapters/fs-book-repository.js'
import { chapterMarkdown } from '../fixtures/chapter-stream.js'
import { QUIZ_FIXTURE } from '../fixtures/quiz.js'
import { TOC_BOOK_SUBTITLE, TOC_BOOK_TITLE, TOC_CHAPTERS } from '../fixtures/toc-stream.js'

/**
 * Puts a book on disk without going through the UI.
 *
 * Most journeys are not about creating a book, they are about exporting one,
 * renaming one, or listening to one, and driving the whole creation wizard
 * first would make each of those slower and would make an unrelated wizard
 * regression fail six journeys at once. Seeding gets a journey to its
 * subject in one call.
 *
 * Seeding goes through `createFsBookRepository`, never through raw `fs`, so a
 * fixture takes the same validation and atomic-write path production takes.
 * A seeded book that the app cannot read is then a failure here rather than a
 * mystery three assertions later. This mirrors `seedBook` in
 * `server/test/route-harness.ts`, which does the same for the inject suite.
 */

export interface SeedBookOptions extends Partial<BookMeta> {
  /** How many chapters to write markdown for. Defaults to `generatedUpTo`. */
  chaptersOnDisk?: number
  /** Whether to write a quiz alongside each chapter. Defaults to false. */
  withQuizzes?: boolean
}

/**
 * Writes one book into `dataDir` and returns its metadata.
 *
 * Defaults describe a book part-way through being read: three chapters in the
 * table of contents, the first two written, status `reading`.
 */
export async function seedBook(dataDir: string, options: SeedBookOptions = {}): Promise<BookMeta> {
  const { chaptersOnDisk, withQuizzes = false, ...overrides } = options
  const books = createFsBookRepository({ dataDir })

  const id = overrides.id ?? `e2e-${randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  const meta: BookMeta = {
    id,
    title: TOC_BOOK_TITLE,
    subtitle: TOC_BOOK_SUBTITLE,
    prompt: 'Tidal locking\n\nAim it at a physics graduate.',
    status: 'reading',
    totalChapters: TOC_CHAPTERS.length,
    generatedUpTo: 2,
    createdAt: now,
    updatedAt: now,
    tags: [],
    audioGeneratedChapters: [],
    ...overrides,
  }

  await books.saveBook(meta)
  await books.saveToc(id, { chapters: TOC_CHAPTERS.map(chapter => ({ ...chapter })) })

  const written = chaptersOnDisk ?? meta.generatedUpTo
  for (let num = 1; num <= written; num++) {
    await books.saveChapter(id, num, chapterMarkdown(num))
    if (withQuizzes) await books.saveQuiz(id, num, QUIZ_FIXTURE as Quiz)
  }

  return meta
}

/** Reads a book's metadata back off disk, for assertions that a journey persisted something. */
export async function readBook(dataDir: string, bookId: string): Promise<BookMeta> {
  return createFsBookRepository({ dataDir }).getBook(bookId)
}

/** The repository pointed at a journey's temp data directory, for any read or write the helpers above do not cover. */
export function bookRepository(dataDir: string) {
  return createFsBookRepository({ dataDir })
}
