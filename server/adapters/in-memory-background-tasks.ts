import { randomUUID } from 'node:crypto'
import type { TaskEvent } from '@shared/events.js'
import type { BackgroundTasks, StartTaskSpec, Task, TaskHandle } from '../ports/background-tasks.js'

/**
 * Mirrors TASK_CLEANUP_DELAY_MS in server/constants.ts (60 seconds, today).
 * Adapters stay free of imports outside node:*, @shared/*, and ../ports/*,
 * so the value is pinned here directly rather than imported, the same way
 * server/ports/background-tasks.fake.ts already pins it. If the real
 * constant ever changes, the eviction-timing contract test is what catches
 * the drift.
 */
const EVICTION_DELAY_MS = 60_000

export interface InMemoryBackgroundTasksDeps {
  /** Generates a fresh task id. Defaults to node:crypto randomUUID, overridable for deterministic tests. */
  newId?: () => string
}

/**
 * The real BackgroundTasks adapter. Its logic is lifted verbatim from the
 * pre-port server/services/task-manager.ts, a bare module of exported
 * functions closing over one module-level Map, reshaped into a factory so
 * every call gets its own state in a fresh closure instead of state that
 * lives for the lifetime of the process from the moment the module is
 * first imported.
 *
 * server/services/task-manager.ts now holds a single module-scope instance
 * of this factory and re-exports its behaviour under the original function
 * names, so every existing call site keeps working unchanged. See that
 * file's own header comment for why it still exists as a shim.
 *
 * The controller behind each TaskHandle is kept in a private, adapter-only
 * Map and is never returned to a caller, only its signal is (see
 * TaskHandle in server/ports/background-tasks.ts). Only this factory's own
 * cancel() may ever call controller.abort().
 */
export function createInMemoryBackgroundTasks(deps: InMemoryBackgroundTasksDeps = {}): BackgroundTasks {
  const newId = deps.newId ?? randomUUID
  const tasks = new Map<string, Task>()
  const controllers = new Map<string, AbortController>()
  const subscribers = new Set<(event: TaskEvent) => void>()

  const emit = (event: TaskEvent): void => {
    for (const cb of subscribers) {
      try {
        cb(event)
      } catch {
        // A broken subscriber must not stop the others from being notified.
      }
    }
  }

  const scheduleEviction = (taskId: string): void => {
    setTimeout(() => {
      tasks.delete(taskId)
      controllers.delete(taskId)
    }, EVICTION_DELAY_MS)
  }

  return {
    start(spec: StartTaskSpec): TaskHandle {
      const id = newId()
      const controller = new AbortController()
      const task: Task = {
        id,
        type: spec.type,
        bookId: spec.bookId,
        bookTitle: spec.bookTitle,
        status: 'running',
        progress: { current: 0, total: spec.total, label: 'Starting...' },
      }
      tasks.set(id, task)
      controllers.set(id, controller)
      emit({ type: 'task_created', task: { ...task } })
      return { id, signal: controller.signal }
    },

    report(taskId, current, label) {
      const task = tasks.get(taskId)
      if (!task || task.status !== 'running') return
      task.progress = { ...task.progress, current, label }
      emit({ type: 'task_progress', taskId, progress: task.progress })
    },

    succeed(taskId, result) {
      const task = tasks.get(taskId)
      if (!task) return
      task.status = 'done'
      task.result = result
      task.progress = { ...task.progress, current: task.progress.total, label: 'Complete' }
      emit({ type: 'task_done', taskId, taskType: task.type, result })
      scheduleEviction(taskId)
    },

    fail(taskId, error) {
      const task = tasks.get(taskId)
      if (!task) return
      task.status = 'error'
      task.error = error
      emit({ type: 'task_error', taskId, taskType: task.type, error })
      scheduleEviction(taskId)
    },

    cancel(taskId) {
      const task = tasks.get(taskId)
      const controller = controllers.get(taskId)
      if (!task || !controller || task.status !== 'running') return false
      controller.abort()
      task.status = 'cancelled'
      emit({ type: 'task_cancelled', taskId })
      scheduleEviction(taskId)
      return true
    },

    get(taskId) {
      const task = tasks.get(taskId)
      return task ? { ...task } : undefined
    },

    list() {
      return Array.from(tasks.values()).map(task => ({ ...task }))
    },

    findActive(bookId, type) {
      for (const task of tasks.values()) {
        if (task.bookId === bookId && task.status === 'running' && (!type || task.type === type)) {
          const controller = controllers.get(task.id)
          if (controller) return { id: task.id, signal: controller.signal }
        }
      }
      return undefined
    },

    subscribe(cb) {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },
  }
}
