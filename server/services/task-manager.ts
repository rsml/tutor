import { createInMemoryBackgroundTasks } from '../adapters/in-memory-background-tasks.js'
import { TASK_CLEANUP_DELAY_MS } from '../constants.js'

/**
 * THIS MODULE IS A TEMPORARY SHIM.
 *
 * server/services/task-manager.ts used to be a bare module of exported
 * functions closing over one module-level Map. The real logic now lives
 * behind the BackgroundTasks port, in
 * server/adapters/in-memory-background-tasks.ts, built as a factory
 * instead of import-time state. This file constructs a single module-scope
 * instance of that factory and re-exports its behaviour under the exact
 * function names and signatures every route file (server/routes/books.ts,
 * covers.ts, audiobook.ts, tasks.ts) and server/services/audiobook-generator.ts
 * already import, so the singleton-to-factory conversion could land in one
 * atomic change without also rewriting every call site in the same commit.
 *
 * A later stage moves each of those call sites onto the BackgroundTasks
 * port directly, constructed once at the composition root and threaded
 * through instead of imported as a singleton, and this file goes away.
 *
 * Two fields callers still read do not fit the port's own Task shape, and
 * live only here, never inside the adapter: createdAt (server/routes/covers.ts
 * uses it as a race guard against a cover set after generation started) and
 * a callable abortController (routes and server/services/audiobook-generator.ts,
 * plus its test, read and in one case directly call task.abortController).
 * The port's TaskHandle deliberately exposes only a signal, never the
 * controller behind it, so this shim keeps its own small side table of
 * { createdAt, controller } keyed by task id, evicted on the same delay and
 * lifecycle points the adapter itself uses for its own state.
 */

export type TaskType =
  | 'generate-all'
  | 'generate-epub'
  | 'generate-cover'
  | 'install-audiobook'
  | 'generate-audiobook'
export type TaskStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface TaskProgress {
  current: number
  total: number
  label: string
}

export interface BackgroundTask {
  id: string
  type: TaskType
  bookId: string
  bookTitle: string
  status: TaskStatus
  progress: TaskProgress
  createdAt: string
  error?: string
  result?: unknown
  abortController: AbortController
}

export type TaskEvent =
  | { type: 'task_created'; task: ClientTask }
  | { type: 'task_progress'; taskId: string; progress: TaskProgress }
  | { type: 'task_done'; taskId: string; taskType: TaskType; result?: unknown }
  | { type: 'task_error'; taskId: string; taskType: TaskType; error: string }
  | { type: 'task_cancelled'; taskId: string }

export interface ClientTask {
  id: string
  type: TaskType
  bookId: string
  bookTitle: string
  status: TaskStatus
  progress: TaskProgress
  error?: string
  result?: unknown
}

type GlobalSubscriber = (event: TaskEvent) => void

const instance = createInMemoryBackgroundTasks()

const extras = new Map<string, { createdAt: string; controller: AbortController }>()

function scheduleExtrasCleanup(taskId: string): void {
  setTimeout(() => {
    extras.delete(taskId)
  }, TASK_CLEANUP_DELAY_MS)
}

function toBackgroundTask(taskId: string): BackgroundTask | undefined {
  const task = instance.get(taskId)
  const extra = extras.get(taskId)
  if (!task || !extra) return undefined
  return { ...task, createdAt: extra.createdAt, abortController: extra.controller }
}

export function createTask(type: TaskType, bookId: string, bookTitle: string, total: number): BackgroundTask {
  const handle = instance.start({ type, bookId, bookTitle, total })
  extras.set(handle.id, { createdAt: new Date().toISOString(), controller: new AbortController() })
  // The entry set above always exists at this id immediately afterward, so
  // this lookup can never miss.
  return toBackgroundTask(handle.id)!
}

export function updateProgress(taskId: string, current: number, label: string): void {
  instance.report(taskId, current, label)
}

export function completeTask(taskId: string, result?: unknown): void {
  const existed = instance.get(taskId) !== undefined
  instance.succeed(taskId, result)
  if (existed) scheduleExtrasCleanup(taskId)
}

export function failTask(taskId: string, error: string): void {
  const existed = instance.get(taskId) !== undefined
  instance.fail(taskId, error)
  if (existed) scheduleExtrasCleanup(taskId)
}

export function cancelTask(taskId: string): boolean {
  const cancelled = instance.cancel(taskId)
  if (cancelled) {
    extras.get(taskId)?.controller.abort()
    scheduleExtrasCleanup(taskId)
  }
  return cancelled
}

export function getTask(taskId: string): ClientTask | undefined {
  return instance.get(taskId)
}

export function listTasks(): ClientTask[] {
  return instance.list()
}

export function getActiveTaskForBook(bookId: string, type?: TaskType): BackgroundTask | undefined {
  const handle = instance.findActive(bookId, type)
  return handle ? toBackgroundTask(handle.id) : undefined
}

export function subscribeGlobal(callback: GlobalSubscriber): () => void {
  return instance.subscribe(callback)
}
