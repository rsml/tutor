import { describe, expect, it, vi } from 'vitest'
import type { BookMeta, GenerationJob, GenerationJobType } from '@shared/domain.js'
import type { JobJournal } from '../ports/job-journal.js'
import type { BackgroundTasks } from '../ports/background-tasks.js'
import type { ChapterGenerationStream } from './chapter-generation-stream.js'
import type { GenerateNextChapterOptions } from './generate-next-chapter.js'
import { createFakeJobJournal } from '../ports/job-journal.fake.js'
import { createFakeBookRepository } from '../ports/book-repository.fake.js'
import { createFakeBackgroundTasks } from '../ports/background-tasks.fake.js'
import { createResumeInterruptedJobs } from './resume-interrupted-jobs.js'

/**
 * A book with 4 of 6 chapters generated, the fixture every "resume acts on
 * disk" test needs: generatedUpTo is the fact a stale or wrong checkpoint
 * must never override.
 */
const BOOK_META: BookMeta = {
  id: 'book-1',
  title: 'Distributed Systems',
  prompt: 'Learn distributed systems',
  status: 'reading',
  totalChapters: 6,
  generatedUpTo: 4,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  tags: [],
  audioGeneratedChapters: [],
}

let jobCounter = 0
/** A journalled job with sane defaults, so each test only states what it's actually testing. */
function makeJob(overrides: Partial<GenerationJob> & { type: GenerationJobType; bookId: string }): GenerationJob {
  jobCounter += 1
  return {
    id: `job-${jobCounter}`,
    bookTitle: BOOK_META.title,
    status: 'running',
    checkpoint: { kind: 'none' },
    params: {},
    startedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

type GenerateAllChaptersFn = (
  bookId: string,
  meta: { title: string; generatedUpTo: number; totalChapters: number },
  options: GenerateNextChapterOptions,
) => { taskId: string }

type GenerateAudiobookFn = (req: {
  bookId: string
  voiceId?: string
  speed?: number
  confirmReplace?: boolean
}) => Promise<{ outcome: string; taskId?: string }>

/**
 * A fully-typed vi.fn() stub for generateAllChapters. Explicitly annotating
 * impl before handing it to vi.fn() (rather than passing an inline arrow
 * straight in) is load bearing, not stylistic: vi.fn() infers its mock's
 * call signature from whatever it is given, and an untyped zero-arg arrow
 * infers a signature too loose to satisfy createResumeInterruptedJobs's
 * deps type, which tsc (not vitest itself) then rejects.
 */
function stubGenerateAllChapters(result: { taskId: string } = { taskId: 'task-x' }) {
  const impl: GenerateAllChaptersFn = () => result
  return vi.fn(impl)
}

/** Same reasoning as stubGenerateAllChapters above, for generateAudiobook. */
function stubGenerateAudiobook(result: { outcome: string; taskId?: string } = { outcome: 'not-complete' }) {
  const impl: GenerateAudiobookFn = async () => result
  return vi.fn(impl)
}

type LogFn = (msg: string, ctx?: Record<string, unknown>) => void

/** Same reasoning as stubGenerateAllChapters above, for the log dependency. */
function stubLog() {
  const impl: LogFn = () => {}
  return vi.fn(impl)
}

function makeDeps(overrides: {
  journal: JobJournal
  books: ReturnType<typeof createFakeBookRepository>
  backgroundTasks?: BackgroundTasks
  chapterStream?: Pick<ChapterGenerationStream, 'seedInterrupted'>
  generateAllChapters?: ReturnType<typeof stubGenerateAllChapters>
  generateAudiobook?: ReturnType<typeof stubGenerateAudiobook>
  autoResume?: boolean
  log?: ReturnType<typeof stubLog>
}) {
  return {
    journal: overrides.journal,
    books: overrides.books,
    backgroundTasks: overrides.backgroundTasks ?? createFakeBackgroundTasks(),
    chapterStream: overrides.chapterStream ?? { seedInterrupted: vi.fn() },
    generateAllChapters: overrides.generateAllChapters ?? stubGenerateAllChapters(),
    generateAudiobook: overrides.generateAudiobook ?? stubGenerateAudiobook(),
    autoResume: overrides.autoResume ?? true,
    log: overrides.log ?? stubLog(),
  }
}

describe('createResumeInterruptedJobs', () => {
  describe('generate-all', () => {
    it('resumes from a fresh read of meta.generatedUpTo, never from the journalled checkpoint — the gate on the whole resume design', async () => {
      const journal = createFakeJobJournal()
      const books = createFakeBookRepository()
      await books.saveBook(BOOK_META) // generatedUpTo: 4, on disk, right now

      // The checkpoint lies: it claims the job only got through chapter 1.
      // If resume trusted it, chapters 2-4 (already on disk) would be
      // regenerated. Disk is the truth, the checkpoint is advisory only.
      journal.record(makeJob({
        id: 'job-resume-all', type: 'generate-all', bookId: BOOK_META.id,
        checkpoint: { kind: 'chapters', through: 1 },
        params: { model: 'claude-sonnet-4-6' },
      }))

      const generateAllChapters = stubGenerateAllChapters({ taskId: 'task-all' })
      const resume = createResumeInterruptedJobs(makeDeps({ journal, books, generateAllChapters }))

      const report = await resume()

      expect(generateAllChapters).toHaveBeenCalledTimes(1)
      const [bookIdArg, metaArg, optionsArg] = generateAllChapters.mock.calls[0]
      expect(bookIdArg).toBe(BOOK_META.id)
      // The load-bearing assertion: generatedUpTo came from disk (4), not
      // from checkpoint.through (1). generateAllChapters itself computes
      // startFrom = meta.generatedUpTo + 1 = 5, so nothing at or below
      // chapter 4 is ever regenerated. That computation is proven
      // separately in generate-all-chapters.test.ts; what resume alone
      // must prove is that it handed over the real number.
      expect(metaArg).toMatchObject({ generatedUpTo: 4, totalChapters: 6, title: BOOK_META.title })
      expect(optionsArg).toMatchObject({ model: 'claude-sonnet-4-6' })
      expect(report.resumed).toEqual([{ jobId: 'job-resume-all', type: 'generate-all' }])
    })

    it('skips a generate-all job whose book is already fully generated, and clears its record', async () => {
      const journal = createFakeJobJournal()
      const books = createFakeBookRepository()
      await books.saveBook({ ...BOOK_META, generatedUpTo: 6, totalChapters: 6 })
      journal.record(makeJob({ id: 'job-complete', type: 'generate-all', bookId: BOOK_META.id }))

      const generateAllChapters = stubGenerateAllChapters()
      const resume = createResumeInterruptedJobs(makeDeps({ journal, books, generateAllChapters }))

      const report = await resume()

      expect(generateAllChapters).not.toHaveBeenCalled()
      expect(report.skipped).toEqual([{ jobId: 'job-complete', type: 'generate-all', reason: expect.any(String) }])
      expect(await journal.listInterrupted()).toEqual([])
    })
  })

  describe('generate-audiobook', () => {
    it('resumes by calling generateAudiobook with confirmReplace true and the journalled voice and speed', async () => {
      const journal = createFakeJobJournal()
      const books = createFakeBookRepository()
      await books.saveBook({ ...BOOK_META, generatedUpTo: 6, totalChapters: 6 })
      journal.record(makeJob({
        id: 'job-audio', type: 'generate-audiobook', bookId: BOOK_META.id,
        params: { voiceId: 'onyx', speed: 1.2 },
      }))

      const generateAudiobook = stubGenerateAudiobook({ outcome: 'started', taskId: 'task-audio' })
      const resume = createResumeInterruptedJobs(makeDeps({ journal, books, generateAudiobook }))

      const report = await resume()

      expect(generateAudiobook).toHaveBeenCalledWith({
        bookId: BOOK_META.id, voiceId: 'onyx', speed: 1.2, confirmReplace: true,
      })
      expect(report.resumed).toEqual([{ jobId: 'job-audio', type: 'generate-audiobook' }])
    })

    it('skips when the resumed call does not actually start, using its outcome as the skip reason', async () => {
      const journal = createFakeJobJournal()
      const books = createFakeBookRepository()
      await books.saveBook({ ...BOOK_META, generatedUpTo: 6, totalChapters: 6 })
      journal.record(makeJob({ id: 'job-audio-skip', type: 'generate-audiobook', bookId: BOOK_META.id }))

      const generateAudiobook = stubGenerateAudiobook({ outcome: 'engine-not-installed' })
      const resume = createResumeInterruptedJobs(makeDeps({ journal, books, generateAudiobook }))

      const report = await resume()

      expect(report.skipped).toEqual([{ jobId: 'job-audio-skip', type: 'generate-audiobook', reason: 'engine-not-installed' }])
      expect(await journal.listInterrupted()).toEqual([])
    })
  })

  describe.each<GenerationJobType>(['generate-epub', 'generate-cover', 'install-audiobook'])('%s', (type) => {
    it('is marked errored and retriable in the tray, and never reaches generateAllChapters or generateAudiobook', async () => {
      const journal = createFakeJobJournal()
      const books = createFakeBookRepository()
      await books.saveBook(BOOK_META)
      journal.record(makeJob({ id: 'job-short', type, bookId: BOOK_META.id }))

      const backgroundTasks = createFakeBackgroundTasks()
      const generateAllChapters = stubGenerateAllChapters()
      const generateAudiobook = stubGenerateAudiobook()
      const resume = createResumeInterruptedJobs(makeDeps({ journal, books, backgroundTasks, generateAllChapters, generateAudiobook }))

      const report = await resume()

      const tasksOfType = backgroundTasks.list().filter((t) => t.type === type)
      expect(tasksOfType).toHaveLength(1)
      expect(tasksOfType[0]).toMatchObject({
        bookId: BOOK_META.id,
        status: 'error',
        error: 'Interrupted by restart',
      })
      expect(report.markedErrored).toEqual([{ jobId: 'job-short', type }])
      expect(generateAllChapters).not.toHaveBeenCalled()
      expect(generateAudiobook).not.toHaveBeenCalled()
    })
  })

  describe('generate-chapter', () => {
    it('seeds the hub with the journalled targetChapterNum when one was set (a regeneration)', async () => {
      const journal = createFakeJobJournal()
      const books = createFakeBookRepository()
      await books.saveBook(BOOK_META) // generatedUpTo: 4
      journal.record(makeJob({
        id: 'job-regen', type: 'generate-chapter', bookId: BOOK_META.id, params: { targetChapterNum: 2 },
      }))

      const chapterStream = { seedInterrupted: vi.fn() }
      const resume = createResumeInterruptedJobs(makeDeps({ journal, books, chapterStream }))

      const report = await resume()

      expect(chapterStream.seedInterrupted).toHaveBeenCalledWith(BOOK_META.id, 2, expect.any(String))
      expect(report.markedErrored).toEqual([{ jobId: 'job-regen', type: 'generate-chapter' }])
    })

    it('falls back to meta.generatedUpTo + 1 when no targetChapterNum was journalled (the just-in-time next chapter)', async () => {
      const journal = createFakeJobJournal()
      const books = createFakeBookRepository()
      await books.saveBook(BOOK_META) // generatedUpTo: 4
      journal.record(makeJob({ id: 'job-next', type: 'generate-chapter', bookId: BOOK_META.id, params: {} }))

      const chapterStream = { seedInterrupted: vi.fn() }
      const resume = createResumeInterruptedJobs(makeDeps({ journal, books, chapterStream }))

      await resume()

      expect(chapterStream.seedInterrupted).toHaveBeenCalledWith(BOOK_META.id, 5, expect.any(String))
    })
  })

  describe('journal hygiene', () => {
    it('clears the original record of every job it handles, whichever of resumed, markedErrored, or skipped it lands in', async () => {
      const journal = createFakeJobJournal()
      const books = createFakeBookRepository()
      await books.saveBook(BOOK_META) // not complete: 4 of 6
      await books.saveBook({ ...BOOK_META, id: 'book-complete', generatedUpTo: 6, totalChapters: 6 })

      journal.record(makeJob({ id: 'job-resumed', type: 'generate-all', bookId: BOOK_META.id }))
      journal.record(makeJob({ id: 'job-skipped', type: 'generate-all', bookId: 'book-complete' }))
      journal.record(makeJob({ id: 'job-errored-tray', type: 'generate-epub', bookId: BOOK_META.id }))
      journal.record(makeJob({ id: 'job-errored-hub', type: 'generate-chapter', bookId: BOOK_META.id }))

      const resume = createResumeInterruptedJobs(makeDeps({ journal, books }))

      const report = await resume()

      expect(report.resumed).toContainEqual({ jobId: 'job-resumed', type: 'generate-all' })
      expect(report.skipped).toContainEqual({ jobId: 'job-skipped', type: 'generate-all', reason: expect.any(String) })
      expect(report.markedErrored).toContainEqual({ jobId: 'job-errored-tray', type: 'generate-epub' })
      expect(report.markedErrored).toContainEqual({ jobId: 'job-errored-hub', type: 'generate-chapter' })
      expect(await journal.listInterrupted()).toEqual([])
    })

    // autoResume is a debugging escape hatch (TUTOR_NO_AUTO_RESUME=1), not a
    // way to defer work. If it touched the journal, a later boot with the
    // flag removed would find nothing left to resume, silently losing every
    // job it was meant to merely delay looking at.
    it('autoResume: false is a true no-op, so a later boot with the flag removed still finds every record', async () => {
      const journal = createFakeJobJournal()
      const books = createFakeBookRepository()
      await books.saveBook(BOOK_META)
      journal.record(makeJob({ id: 'job-1', type: 'generate-all', bookId: BOOK_META.id }))
      journal.record(makeJob({ id: 'job-2', type: 'generate-epub', bookId: BOOK_META.id }))
      journal.record(makeJob({ id: 'job-3', type: 'generate-chapter', bookId: BOOK_META.id }))

      const backgroundTasks = createFakeBackgroundTasks()
      const chapterStream = { seedInterrupted: vi.fn() }
      const generateAllChapters = stubGenerateAllChapters()
      const generateAudiobook = stubGenerateAudiobook()
      const resume = createResumeInterruptedJobs(makeDeps({
        journal, books, backgroundTasks, chapterStream, generateAllChapters, generateAudiobook, autoResume: false,
      }))

      const report = await resume()

      expect(report).toEqual({ resumed: [], markedErrored: [], skipped: [] })
      expect(generateAllChapters).not.toHaveBeenCalled()
      expect(generateAudiobook).not.toHaveBeenCalled()
      expect(chapterStream.seedInterrupted).not.toHaveBeenCalled()
      expect(backgroundTasks.list()).toEqual([])

      const stillJournalled = await journal.listInterrupted()
      expect(stillJournalled.map((j) => j.id).sort()).toEqual(['job-1', 'job-2', 'job-3'])
    })
  })

  describe('fault isolation', () => {
    it('skips a job whose book no longer exists, without throwing out of the whole pass, and still resumes a good job that follows it', async () => {
      const journal = createFakeJobJournal()
      const books = createFakeBookRepository()
      // Only 'book-2' exists. 'book-1' (referenced by the first job) does not,
      // e.g. the user deleted the book after the job was journalled.
      await books.saveBook({ ...BOOK_META, id: 'book-2', generatedUpTo: 0, totalChapters: 3 })

      journal.record(makeJob({ id: 'job-missing-book', type: 'generate-all', bookId: 'book-1' }))
      journal.record(makeJob({ id: 'job-good', type: 'generate-all', bookId: 'book-2' }))

      const generateAllChapters = stubGenerateAllChapters({ taskId: 'task-good' })
      const resume = createResumeInterruptedJobs(makeDeps({ journal, books, generateAllChapters }))

      // No try/catch here on purpose: if resume let the missing-book
      // failure escape instead of catching it per-job, this await would
      // reject and fail the test on its own.
      const report = await resume()

      expect(report.skipped).toContainEqual({ jobId: 'job-missing-book', type: 'generate-all', reason: expect.any(String) })
      expect(generateAllChapters).toHaveBeenCalledTimes(1)
      expect(generateAllChapters.mock.calls[0][0]).toBe('book-2')
      expect(report.resumed).toContainEqual({ jobId: 'job-good', type: 'generate-all' })
      expect(await journal.listInterrupted()).toEqual([])
    })
  })
})
