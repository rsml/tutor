import type { TaskEvent } from '@shared/events'
import { request } from './http'
import { subscribeToTasks } from './sse'

/**
 * This module cancels background tasks and streams their events live, which
 * the background tasks footer and the generate-all modal both consume.
 */

/** Cancels a running background task. */
export function cancelTask(taskId: string): Promise<void> {
  return request<void>(`/api/tasks/${taskId}`, { method: 'DELETE' })
}

/**
 * Subscribes to the background task stream and pins its event type to
 * TaskEvent in this one place, so the footer and the generate-all modal
 * cannot disagree about the events they read. Returns the unsubscribe
 * function unchanged.
 */
export function subscribeToTaskEvents(onEvent: (event: TaskEvent) => void): () => void {
  return subscribeToTasks<TaskEvent>(onEvent)
}
