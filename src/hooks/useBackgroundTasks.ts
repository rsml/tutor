import { useEffect } from 'react'
import { toast } from '@src/lib/toast'
import { store, useAppDispatch } from '@src/store'
import { taskCreated, taskProgressUpdated, taskCompleted, taskFailed, taskCancelled } from '@src/store'
import { apiUrl } from '@src/lib/api-base'

function taskDoneMessage(taskType?: string): string {
  switch (taskType) {
    case 'generate-cover': return 'Cover generated!'
    case 'generate-all': return 'All chapters generated!'
    case 'generate-epub': return 'EPUB export complete!'
    case 'generate-audiobook': return 'Audiobook ready!'
    case 'install-audiobook': return 'Audiobook narrator ready!'
    default: return 'Task complete!'
  }
}

function taskErrorMessage(taskType?: string, error?: string): string {
  const prefix = taskType === 'generate-cover' ? 'Cover generation failed'
    : taskType === 'generate-all' ? 'Book generation failed'
    : taskType === 'generate-epub' ? 'EPUB export failed'
    : taskType === 'generate-audiobook' ? 'Audiobook generation failed'
    : taskType === 'install-audiobook' ? 'Narrator setup failed'
    : 'Task failed'
  return error ? `${prefix}: ${error}` : prefix
}

interface UseBackgroundTasksOptions {
  onCoverGenerated?: () => void
  onEpubExported?: (bookId: string, bookTitle: string) => void
  onGenerateAllCompleted?: () => void
  onAudiobookGenerated?: (bookId: string, bookTitle: string) => void
  onAudiobookInstalled?: () => void
}

export function useBackgroundTasks({
  onCoverGenerated,
  onEpubExported,
  onGenerateAllCompleted,
  onAudiobookGenerated,
  onAudiobookInstalled,
}: UseBackgroundTasksOptions = {}) {
  const dispatch = useAppDispatch()

  useEffect(() => {
    let evtSource: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      evtSource = new EventSource(apiUrl('/api/tasks/stream'))

      evtSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          switch (event.type) {
            case 'task_created':
              dispatch(taskCreated(event.task))
              break
            case 'task_progress':
              dispatch(taskProgressUpdated({ taskId: event.taskId, progress: event.progress }))
              break
            case 'task_done':
              dispatch(taskCompleted({ taskId: event.taskId, result: event.result }))
              toast.success(taskDoneMessage(event.taskType))
              switch (event.taskType) {
                case 'generate-cover':
                  onCoverGenerated?.()
                  break
                case 'generate-all':
                  onGenerateAllCompleted?.()
                  break
                case 'generate-epub': {
                  const task = store.getState().backgroundTasks.tasks[event.taskId]
                  if (task) onEpubExported?.(task.bookId, task.bookTitle)
                  break
                }
                case 'generate-audiobook': {
                  const task = store.getState().backgroundTasks.tasks[event.taskId]
                  if (task) onAudiobookGenerated?.(task.bookId, task.bookTitle)
                  break
                }
                case 'install-audiobook':
                  onAudiobookInstalled?.()
                  break
              }
              break
            case 'task_error':
              dispatch(taskFailed({ taskId: event.taskId, error: event.error }))
              toast.error(taskErrorMessage(event.taskType, event.error))
              break
            case 'task_cancelled':
              dispatch(taskCancelled({ taskId: event.taskId }))
              break
          }
        } catch { /* ignore parse errors */ }
      }

      evtSource.onerror = () => {
        evtSource?.close()
        // Reconnect after 3s
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      evtSource?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [dispatch, onCoverGenerated, onEpubExported, onGenerateAllCompleted, onAudiobookGenerated, onAudiobookInstalled])
}
