import type { GenerationJob, GenerationJobType } from '@shared/domain.js'
import type { JobJournal } from '../ports/job-journal.js'
import type { BookRepository } from '../ports/book-repository.js'
import type { BackgroundTasks } from '../ports/background-tasks.js'
import type { ChapterGenerationStream } from './chapter-generation-stream.js'
import type { GenerateNextChapterOptions } from './generate-next-chapter.js'
import { DEFAULT_MODEL } from '../constants.js'

/**
 * Runs once at boot, after crash recovery (see the ordering comment on
 * runStartupTasks in server/index.ts), and decides what to do with every
 * job whose journal record survived a restart. A surviving record can only
 * mean the process ended before that job reached a terminal state, see
 * JobJournal's own doc for why.
 *
 * The idempotency rule that makes this safe: disk is the truth, and the
 * journalled checkpoint is advisory only. generate-all never resumes from
 * checkpoint.through, it re-reads meta.yml through BookRepository and
 * hands the resumed generateAllChapters call the SAME generatedUpTo a
 * fresh request would see, so a stale or wrong checkpoint can never cause
 * a chapter already on disk to be regenerated, the checkpoint only ever
 * seeded a progress label, never a decision. generate-audiobook resumes by
 * restarting narration from the beginning rather than trying to skip
 * chapters already narrated, not out of caution but because by the time
 * this runs, crash recovery has already deleted the book's whole audio/
 * directory whenever book.m4b was absent and cleared
 * audioGeneratedChapters, so there is nothing partial left to skip.
 *
 * Per type policy:
 *   - generate-all and generate-audiobook: auto-resumed, unless the book
 *     already satisfies the job (fully generated already, or the resumed
 *     call itself reports it did not actually start), in which case
 *     skipped instead, with the reason recorded.
 *   - generate-epub, generate-cover, install-audiobook: short, cheap
 *     steps. Marked errored and retriable in the existing tray rather than
 *     resumed, so the user can re-click the button that already exists.
 *   - generate-chapter: never a tray task, so instead the single-chapter
 *     generation hub is seeded with a terminal error via seedInterrupted,
 *     which the reader's existing generation-error panel surfaces.
 *
 * Every job this function decides on, whichever of resumed, markedErrored,
 * or skipped it lands in, has its ORIGINAL journal record cleared once
 * decided, so the next boot does not process it again. The one exception
 * is autoResume: false (TUTOR_NO_AUTO_RESUME=1), a debugging escape hatch
 * that leaves the journal completely untouched, so removing the flag on a
 * later boot finds every job exactly as it was.
 *
 * One bad job, most commonly one whose book was deleted after the job was
 * journalled, is skipped rather than allowed to throw out of the whole
 * pass, the same promise the library migrator makes for a single corrupt
 * book. Every attempted job logs its outcome.
 */

export interface ResumeReport {
  resumed: Array<{ jobId: string; type: GenerationJobType }>
  markedErrored: Array<{ jobId: string; type: GenerationJobType }>
  skipped: Array<{ jobId: string; type: GenerationJobType; reason: string }>
}

/** Shown on every tray task this pass marks errored, and used verbatim as the generate-chapter hub error message too. */
const INTERRUPTED_MESSAGE = 'Interrupted by restart'

export function createResumeInterruptedJobs(deps: {
  journal: JobJournal
  books: Pick<BookRepository, 'getBook'>
  backgroundTasks: BackgroundTasks
  chapterStream: Pick<ChapterGenerationStream, 'seedInterrupted'>
  generateAllChapters: (
    bookId: string,
    meta: { title: string; generatedUpTo: number; totalChapters: number },
    options: GenerateNextChapterOptions,
  ) => { taskId: string }
  generateAudiobook: (req: { bookId: string; voiceId?: string; speed?: number; confirmReplace?: boolean }) => Promise<{ outcome: string; taskId?: string }>
  autoResume: boolean
  log: (msg: string, ctx?: Record<string, unknown>) => void
}): () => Promise<ResumeReport> {
  const { journal, books, backgroundTasks, chapterStream, generateAllChapters, generateAudiobook, autoResume, log } = deps

  /** The handful of request parameters a job needs to restart, reconstructed from what was journalled. model always has a value, falling back the same way an on-demand quiz regeneration does. */
  function optionsFrom(params: GenerationJob['params']): GenerateNextChapterOptions {
    return {
      model: params.model ?? DEFAULT_MODEL,
      ...(params.provider !== undefined ? { provider: params.provider } : {}),
      ...(params.quizModel !== undefined ? { quizModel: params.quizModel } : {}),
      ...(params.quizProvider !== undefined ? { quizProvider: params.quizProvider } : {}),
      ...(params.quizLength !== undefined ? { quizLength: params.quizLength } : {}),
    }
  }

  async function handle(job: GenerationJob, report: ResumeReport): Promise<void> {
    // Fetched fresh for every job, never trusted from the journal, this
    // one call is what makes "disk is the truth" true rather than aspirational.
    const meta = await books.getBook(job.bookId)

    switch (job.type) {
      case 'generate-all': {
        if (meta.generatedUpTo >= meta.totalChapters) {
          report.skipped.push({ jobId: job.id, type: job.type, reason: 'Book is already fully generated' })
          log('resume: skipped generate-all, book already complete', { jobId: job.id, bookId: job.bookId })
          return
        }
        generateAllChapters(job.bookId, meta, optionsFrom(job.params))
        report.resumed.push({ jobId: job.id, type: job.type })
        log('resume: resumed generate-all', { jobId: job.id, bookId: job.bookId, generatedUpTo: meta.generatedUpTo })
        return
      }

      case 'generate-audiobook': {
        const result = await generateAudiobook({
          bookId: job.bookId,
          confirmReplace: true,
          ...(job.params.voiceId !== undefined ? { voiceId: job.params.voiceId } : {}),
          ...(job.params.speed !== undefined ? { speed: job.params.speed } : {}),
        })
        if (result.outcome === 'started') {
          report.resumed.push({ jobId: job.id, type: job.type })
          log('resume: resumed generate-audiobook', { jobId: job.id, bookId: job.bookId })
        } else {
          report.skipped.push({ jobId: job.id, type: job.type, reason: result.outcome })
          log('resume: skipped generate-audiobook', { jobId: job.id, bookId: job.bookId, reason: result.outcome })
        }
        return
      }

      case 'generate-epub':
      case 'generate-cover':
      case 'install-audiobook': {
        const handle = backgroundTasks.start({ type: job.type, bookId: job.bookId, bookTitle: job.bookTitle, total: 1 })
        backgroundTasks.fail(handle.id, INTERRUPTED_MESSAGE)
        report.markedErrored.push({ jobId: job.id, type: job.type })
        log('resume: marked errored and retriable in the tray', { jobId: job.id, bookId: job.bookId, type: job.type })
        return
      }

      case 'generate-chapter': {
        const chapterNum = job.params.targetChapterNum ?? meta.generatedUpTo + 1
        chapterStream.seedInterrupted(job.bookId, chapterNum, INTERRUPTED_MESSAGE)
        report.markedErrored.push({ jobId: job.id, type: job.type })
        log('resume: seeded an interrupted chapter generation in the hub', { jobId: job.id, bookId: job.bookId, chapterNum })
        return
      }

      default: {
        // Exhaustiveness guard: a compile error here means a GenerationJobType
        // was added without a case above.
        const exhaustive: never = job.type
        throw new Error(`resume: no handler for job type "${String(exhaustive)}"`)
      }
    }
  }

  return async function resumeInterruptedJobs(): Promise<ResumeReport> {
    const report: ResumeReport = { resumed: [], markedErrored: [], skipped: [] }

    if (!autoResume) {
      // A debugging escape hatch (TUTOR_NO_AUTO_RESUME=1), not a way to
      // defer work. The journal is never even read, let alone cleared,
      // because touching it here would mean a later boot with the flag
      // removed finds nothing left to resume, silently losing every job
      // this was only ever meant to skip looking at for now.
      log('resume: autoResume disabled (TUTOR_NO_AUTO_RESUME=1), leaving the journal untouched')
      return report
    }

    const jobs = await journal.listInterrupted()

    for (const job of jobs) {
      try {
        await handle(job, report)
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Failed to resume'
        report.skipped.push({ jobId: job.id, type: job.type, reason })
        log('resume: skipped a job after it failed', { jobId: job.id, bookId: job.bookId, type: job.type, reason })
      } finally {
        // Cleared regardless of outcome, so a job this pass has already
        // decided on is never re-processed at the next boot.
        journal.clear(job.id)
      }
    }

    return report
  }
}
