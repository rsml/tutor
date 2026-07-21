/**
 * Long-running server jobs as the client sees them.
 *
 * Deliberately excluded from persistence, since the server process that owned
 * these tasks has restarted by the time state is rehydrated, and restoring
 * them would show progress for work that is no longer running.
 */
import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './index'

// --- Background Tasks ---

export interface ClientTask {
  id: string
  type: string
  bookId: string
  bookTitle: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  progress: { current: number; total: number; label: string }
  error?: string
  result?: unknown
}

export interface BackgroundTasksState {
  tasks: Record<string, ClientTask>
}

const backgroundTasksSlice = createSlice({
  name: 'backgroundTasks',
  initialState: { tasks: {} } as BackgroundTasksState,
  reducers: {
    taskCreated(state, action: PayloadAction<ClientTask>) {
      state.tasks[action.payload.id] = action.payload
    },
    taskProgressUpdated(state, action: PayloadAction<{ taskId: string; progress: ClientTask['progress'] }>) {
      const task = state.tasks[action.payload.taskId]
      if (task) task.progress = action.payload.progress
    },
    taskCompleted(state, action: PayloadAction<{ taskId: string; result?: unknown }>) {
      const task = state.tasks[action.payload.taskId]
      if (task) {
        task.status = 'done'
        task.result = action.payload.result
        task.progress = { ...task.progress, current: task.progress.total, label: 'Complete' }
      }
    },
    taskFailed(state, action: PayloadAction<{ taskId: string; error: string }>) {
      const task = state.tasks[action.payload.taskId]
      if (task) {
        task.status = 'error'
        task.error = action.payload.error
      }
    },
    taskCancelled(state, action: PayloadAction<{ taskId: string }>) {
      const task = state.tasks[action.payload.taskId]
      if (task) task.status = 'cancelled'
    },
    taskRemoved(state, action: PayloadAction<{ taskId: string }>) {
      delete state.tasks[action.payload.taskId]
    },
  },
})

export const {
  taskCreated,
  taskProgressUpdated,
  taskCompleted,
  taskFailed,
  taskCancelled,
  taskRemoved,
} = backgroundTasksSlice.actions

export const selectBackgroundTasks = (state: RootState) => state.backgroundTasks.tasks
export const selectRunningTasks = createSelector(
  selectBackgroundTasks,
  (tasks) => Object.values(tasks).filter(t => t.status === 'running'),
)

export const backgroundTasksReducer = backgroundTasksSlice.reducer
