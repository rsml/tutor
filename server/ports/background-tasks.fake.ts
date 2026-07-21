import type { TaskEvent } from '@shared/events.js'
import type { BackgroundTasks, StartTaskSpec, Task, TaskHandle } from './background-tasks.js'

/**
 * Mirrors TASK_CLEANUP_DELAY_MS in server/constants.ts (60 seconds, today).
 * Ports stay free of imports outside @shared/*, so the value is pinned here
 * directly rather than imported. The contract test pins the same number; if
 * the real constant ever changes, the eviction-timing test is what catches
 * the drift.
 */
const EVICTION_DELAY_MS = 60_000

/**
 * Deterministic in-memory BackgroundTasks. State lives in closures created
 * fresh by each call to this factory, unlike the real manager's
 * module-level Map, so independent fakes in different tests never see each
 * other's tasks.
 */
export function createFakeBackgroundTasks(): BackgroundTasks {
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
      const id = crypto.randomUUID()
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
