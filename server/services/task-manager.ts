import { randomUUID } from 'node:crypto'

export type TaskType = 'generate-all' | 'generate-epub' | 'generate-cover'
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
  | { type: 'task_done'; taskId: string; result?: unknown }
  | { type: 'task_error'; taskId: string; error: string }
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

const tasks = new Map<string, BackgroundTask>()
const globalSubscribers = new Set<GlobalSubscriber>()

const CLEANUP_DELAY_MS = 60_000

function toClientTask(task: BackgroundTask): ClientTask {
  return {
    id: task.id,
    type: task.type,
    bookId: task.bookId,
    bookTitle: task.bookTitle,
    status: task.status,
    progress: task.progress,
    error: task.error,
    result: task.result,
  }
}

function emitGlobal(event: TaskEvent): void {
  for (const cb of globalSubscribers) {
    try { cb(event) } catch { /* subscriber error */ }
  }
}

function scheduleCleanup(taskId: string): void {
  setTimeout(() => {
    tasks.delete(taskId)
  }, CLEANUP_DELAY_MS)
}

export function createTask(type: TaskType, bookId: string, bookTitle: string, total: number): BackgroundTask {
  const task: BackgroundTask = {
    id: randomUUID(),
    type,
    bookId,
    bookTitle,
    status: 'running',
    progress: { current: 0, total, label: 'Starting...' },
    createdAt: new Date().toISOString(),
    abortController: new AbortController(),
  }
  tasks.set(task.id, task)
  emitGlobal({ type: 'task_created', task: toClientTask(task) })
  return task
}

export function updateProgress(taskId: string, current: number, label: string): void {
  const task = tasks.get(taskId)
  if (!task || task.status !== 'running') return
  task.progress = { ...task.progress, current, label }
  emitGlobal({ type: 'task_progress', taskId, progress: task.progress })
}

export function completeTask(taskId: string, result?: unknown): void {
  const task = tasks.get(taskId)
  if (!task) return
  task.status = 'done'
  task.result = result
  task.progress = { ...task.progress, current: task.progress.total, label: 'Complete' }
  emitGlobal({ type: 'task_done', taskId, result })
  scheduleCleanup(taskId)
}

export function failTask(taskId: string, error: string): void {
  const task = tasks.get(taskId)
  if (!task) return
  task.status = 'error'
  task.error = error
  emitGlobal({ type: 'task_error', taskId, error })
  scheduleCleanup(taskId)
}

export function cancelTask(taskId: string): boolean {
  const task = tasks.get(taskId)
  if (!task || task.status !== 'running') return false
  task.abortController.abort()
  task.status = 'cancelled'
  emitGlobal({ type: 'task_cancelled', taskId })
  scheduleCleanup(taskId)
  return true
}

export function getTask(taskId: string): ClientTask | undefined {
  const task = tasks.get(taskId)
  return task ? toClientTask(task) : undefined
}

export function listTasks(): ClientTask[] {
  return Array.from(tasks.values()).map(toClientTask)
}

export function getActiveTaskForBook(bookId: string, type?: TaskType): BackgroundTask | undefined {
  for (const task of tasks.values()) {
    if (task.bookId === bookId && task.status === 'running') {
      if (!type || task.type === type) return task
    }
  }
  return undefined
}

export function subscribeGlobal(callback: GlobalSubscriber): () => void {
  globalSubscribers.add(callback)
  return () => { globalSubscribers.delete(callback) }
}
