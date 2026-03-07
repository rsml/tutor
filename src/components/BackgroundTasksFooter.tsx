import { useState, useEffect, useMemo } from 'react'
import { Loader2, CheckCircle2, XCircle, ChevronUp, ChevronDown, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@src/components/ui/dialog'
import { Button } from '@src/components/ui/button'
import { useAppSelector, useAppDispatch, selectBackgroundTasks, selectRunningTasks, taskRemoved, type ClientTask } from '@src/store'
import { apiUrl } from '@src/lib/api-base'

function TaskIcon({ status }: { status: ClientTask['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3.5 animate-spin text-[oklch(0.55_0.20_285)]" />
    case 'done':
      return <CheckCircle2 className="size-3.5 text-green-500" />
    case 'error':
      return <XCircle className="size-3.5 text-status-error" />
    case 'cancelled':
      return <XCircle className="size-3.5 text-content-muted" />
  }
}

function taskTypeLabel(type: string): string {
  switch (type) {
    case 'generate-all': return 'Generating'
    case 'generate-epub': return 'Exporting EPUB'
    case 'generate-cover': return 'Generating cover'
    default: return type
  }
}

export function BackgroundTasksFooter() {
  const allTasks = useAppSelector(selectBackgroundTasks)
  const runningTasks = useAppSelector(selectRunningTasks)
  const dispatch = useAppDispatch()
  const [expanded, setExpanded] = useState(false)

  const taskList = Object.values(allTasks)
  const hasVisibleTasks = taskList.length > 0

  // Stable key for terminal tasks — only re-run effect when terminal task set changes
  const terminalTaskIds = useMemo(
    () => taskList.filter(t => t.status !== 'running').map(t => t.id).join(','),
    [taskList],
  )

  // Auto-remove completed tasks after 10s
  useEffect(() => {
    const ids = terminalTaskIds.split(',').filter(Boolean)
    const timers = ids.map(id =>
      setTimeout(() => dispatch(taskRemoved({ taskId: id })), 10_000),
    )
    return () => timers.forEach(clearTimeout)
  }, [terminalTaskIds, dispatch])

  if (!hasVisibleTasks) return null

  const primaryTask = runningTasks[0]
  const otherCount = runningTasks.length - 1

  const handleCancel = async (taskId: string) => {
    try {
      await fetch(apiUrl(`/api/tasks/${taskId}`), { method: 'DELETE' })
    } catch {
      toast.error('Failed to cancel task')
    }
  }

  return (
    <>
      {/* Compact footer bar */}
      <div
        className="fixed bottom-0 inset-x-0 z-40 flex h-10 cursor-pointer items-center justify-between border-t border-border-default/50 bg-surface-base/95 px-4 backdrop-blur-md"
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center gap-2 text-sm">
          {primaryTask ? (
            <>
              <Loader2 className="size-3.5 animate-spin text-[oklch(0.55_0.20_285)]" />
              <span className="text-content-primary">
                {taskTypeLabel(primaryTask.type)} {primaryTask.bookTitle}
              </span>
              <span className="text-content-muted">
                ({primaryTask.progress.current}/{primaryTask.progress.total})
              </span>
              {otherCount > 0 && (
                <span className="text-content-muted">+ {otherCount} other</span>
              )}
            </>
          ) : (
            <span className="text-content-muted text-xs">
              {taskList.length} task{taskList.length > 1 ? 's' : ''} completed
            </span>
          )}
        </div>
        <ChevronUp className="size-4 text-content-muted" />
      </div>

      {/* Expanded dialog */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Background Tasks</DialogTitle>
              <button onClick={() => setExpanded(false)} className="text-content-muted hover:text-content-primary transition-colors">
                <ChevronDown className="size-4" />
              </button>
            </div>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {taskList.length === 0 ? (
              <p className="text-sm text-content-muted py-4 text-center">No tasks</p>
            ) : (
              taskList.map(task => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-lg border border-border-default/50 bg-surface-raised px-3 py-2"
                >
                  <TaskIcon status={task.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-content-primary truncate">
                        {task.bookTitle}
                      </span>
                      <span className="text-xs text-content-muted shrink-0">
                        {taskTypeLabel(task.type)}
                      </span>
                    </div>
                    {task.status === 'running' && (
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-[oklch(0.55_0.20_285)] transition-all duration-300"
                            style={{ width: `${task.progress.total > 0 ? (task.progress.current / task.progress.total) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-content-muted shrink-0">
                          {task.progress.current}/{task.progress.total}
                        </span>
                      </div>
                    )}
                    {task.status === 'error' && (
                      <p className="text-xs text-status-error mt-0.5">{task.error}</p>
                    )}
                  </div>
                  {task.status === 'running' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(task.id)}
                      className="shrink-0 size-7 p-0 text-content-muted hover:text-status-error"
                    >
                      <X className="size-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dispatch(taskRemoved({ taskId: task.id }))}
                      className="shrink-0 size-7 p-0 text-content-muted hover:text-content-primary"
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
