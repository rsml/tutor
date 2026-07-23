import type { ClientTask, TaskType } from '@shared/responses.js'
import type { TaskEvent } from '@shared/events.js'
import type { GenerationJobParams } from '@shared/domain.js'

/**
 * Tracks long-running background jobs (EPUB export, cover generation,
 * audiobook install and generation, "generate all chapters") so a route
 * can kick a job off, the client can poll or subscribe to its progress
 * over SSE, and the job can be cancelled mid-flight.
 *
 * Abstracts what server/services/task-manager.ts used to be, a bare
 * module of exported functions closing over a single module-level Map. A
 * port makes that swappable and lets services depend on shape rather than
 * concrete functions.
 *
 * The one rule this port exists to enforce: callers receive a TaskHandle
 * exposing only an AbortSignal, never the controller object that can
 * trigger it. Whether a task is cancelled is the manager's decision alone,
 * made through cancel(taskId). A caller that only holds a signal can
 * observe cancellation but can never cause it behind the manager's back.
 *
 * Task is this port's own name for a task snapshot. Its shape is identical
 * to ClientTask in shared/responses.ts, which is the same data serialized
 * for the client, so it is defined here as an alias rather than a second,
 * independently maintained copy of the same fields.
 *
 * server/adapters/in-memory-background-tasks.ts is the base real adapter,
 * and server/composition-root.ts wraps it in the
 * server/adapters/journalled-background-tasks.ts decorator before handing
 * it out, so a running task's record survives a restart. The in-memory
 * fake for tests is background-tasks.fake.ts's createFakeBackgroundTasks,
 * and the shared behavioural spec all three must satisfy is
 * background-tasks.contract.ts's describeBackgroundTasksContract.
 */

/** A background task's current snapshot, as returned by get() and list(). */
export type Task = ClientTask

/** Stops a subscribe() callback from receiving further events. */
type Unsubscribe = () => void

/**
 * What a caller gets back from start() or findActive(): enough to identify
 * the task and observe its cancellation, and nothing that could cause it.
 */
export interface TaskHandle {
  id: string
  signal: AbortSignal
}

/**
 * This becomes the task's first Task snapshot, verbatim. Current starts
 * at 0, total is copied from here unchanged, and label starts as
 * 'Starting...' until the first report() call.
 */
export interface StartTaskSpec {
  type: TaskType
  bookId: string
  bookTitle: string
  total: number
  /**
   * Carried through to the job journal (server/ports/job-journal.ts) so an
   * interrupted job can be restarted with the same request parameters.
   * Optional because most task types need nothing to restart, cover
   * generation and EPUB export just redo their one deterministic step. An
   * API key must never be put here, see GenerationJobParamsSchema.
   */
  params?: GenerationJobParams
}

/**
 * report, succeed, fail, and cancel are keyed by bare taskId, not by
 * TaskHandle, so anything that learned an id from list() or get() can drive
 * a task's lifecycle, not only the caller that started it. Only start and
 * findActive ever hand out the AbortSignal-bearing TaskHandle.
 */
export interface BackgroundTasks {
  start(spec: StartTaskSpec): TaskHandle
  report(taskId: string, current: number, label: string): void
  succeed(taskId: string, result?: unknown): void
  fail(taskId: string, error: string): void
  /** Returns true if a running task was found and cancelled, false otherwise. */
  cancel(taskId: string): boolean
  get(taskId: string): Task | undefined
  list(): Task[]
  /** The running task for a book, optionally narrowed to one task type. */
  findActive(bookId: string, type?: TaskType): TaskHandle | undefined
  subscribe(cb: (event: TaskEvent) => void): Unsubscribe
}
