import type { GenerationJob } from '@shared/domain.js'
import type { BackgroundTasks, StartTaskSpec, TaskHandle } from '../ports/background-tasks.js'
import type { JobJournal } from '../ports/job-journal.js'
import type { Clock } from '../ports/clock.js'

/**
 * Constructor deps for createJournalledBackgroundTasks. All three are
 * required. There is no meaningful default for the inner adapter being
 * decorated, the journal it writes to, or the clock it timestamps with.
 */
export interface JournalledBackgroundTasksDeps {
  inner: BackgroundTasks
  journal: JobJournal
  clock: Clock
}

/**
 * Decorates a BackgroundTasks with persistence, rather than adding
 * persistence to createInMemoryBackgroundTasks directly, so the
 * persistence concern stays separable and independently testable. Running
 * the existing BackgroundTasks contract unchanged against this decorated
 * adapter (see journalled-background-tasks.test.ts) is the proof that
 * adding persistence changed no observable behaviour, every case there was
 * already written against the plain in-memory adapter, and none of it had
 * to be loosened to also pass here.
 *
 * start() journals a record so a job still running when the process dies
 * can be found by JobJournal.listInterrupted() at the next boot. succeed(),
 * fail(), and cancel() all clear that record, each is a terminal state a
 * resumed job would never need to reach again, cancel() included, a
 * cancelled job must not resurrect itself at the next boot. report() never
 * touches the journal, progress is cosmetic, and journalling every sentence
 * of a narration or every percent of an EPUB export would be thousands of
 * writes for information nothing on restart needs.
 */
export function createJournalledBackgroundTasks(deps: JournalledBackgroundTasksDeps): BackgroundTasks {
  const { inner, journal, clock } = deps

  return {
    ...inner,

    start(spec: StartTaskSpec): TaskHandle {
      const handle = inner.start(spec)
      const now = clock.nowIso()
      const job: GenerationJob = {
        id: handle.id,
        type: spec.type,
        bookId: spec.bookId,
        bookTitle: spec.bookTitle,
        status: 'running',
        checkpoint: { kind: 'none' },
        params: spec.params ?? {},
        startedAt: now,
        updatedAt: now,
      }
      journal.record(job)
      return handle
    },

    succeed(taskId, result) {
      inner.succeed(taskId, result)
      journal.clear(taskId)
    },

    fail(taskId, error) {
      inner.fail(taskId, error)
      journal.clear(taskId)
    },

    cancel(taskId) {
      const cancelled = inner.cancel(taskId)
      // Clearing unconditionally, not only when cancelled is true, keeps
      // this a plain no-op-safe cleanup call either way, journal.clear()
      // on an id it never recorded, or already cleared, does nothing. A
      // cancelled job must not resurrect itself at the next boot.
      journal.clear(taskId)
      return cancelled
    },
  }
}
