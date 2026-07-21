import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, ChevronDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@client/components/ui/dialog'
import { subscribeToTaskEvents } from '@client/api'
import { GENERATE_ALL_CANCELLED_CLOSE_MS, GENERATE_ALL_DONE_CLOSE_MS } from '@client/lib/constants'
import type { TaskEvent } from '@shared/events'

interface GenerateAllModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  bookTitle: string
  totalChapters: number
}

/** Only `task_created` nests its task id under `task` rather than at the top level. */
function eventTaskId(event: TaskEvent): string {
  return event.type === 'task_created' ? event.task.id : event.taskId
}

export function GenerateAllModal({ open, onOpenChange, taskId, bookTitle, totalChapters }: GenerateAllModalProps) {
  const [current, setCurrent] = useState(0)
  const [status, setStatus] = useState<'running' | 'done' | 'error' | 'cancelled'>('running')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !taskId) return

    return subscribeToTaskEvents(event => {
      // Filter to our task
      if (eventTaskId(event) !== taskId) return

      switch (event.type) {
        case 'task_progress':
          setCurrent(event.progress.current)
          break
        case 'task_done':
          setStatus('done')
          // Auto-close after brief delay
          setTimeout(() => onOpenChange(false), GENERATE_ALL_DONE_CLOSE_MS)
          break
        case 'task_error':
          setStatus('error')
          setError(event.error)
          break
        case 'task_cancelled':
          setStatus('cancelled')
          setTimeout(() => onOpenChange(false), GENERATE_ALL_CANCELLED_CLOSE_MS)
          break
        case 'task_created':
          setCurrent(event.task.progress.current)
          break
      }
    })
  }, [open, taskId, onOpenChange])

  const progress = totalChapters > 0 ? (current / totalChapters) * 100 : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Generating Book</DialogTitle>
            <button onClick={() => onOpenChange(false)} className="text-content-muted hover:text-content-primary transition-colors">
              <ChevronDown className="size-4" />
            </button>
          </div>
          <DialogDescription>{bookTitle}</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {status === 'running' && (
            <>
              <div className="flex items-center gap-2 text-sm text-content-muted">
                <Loader2 className="size-4 animate-spin" />
                {current > 0
                  ? `Generating chapter ${current} of ${totalChapters}`
                  : 'Starting generation...'}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-[oklch(0.55_0.20_285)] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-content-muted">
                Running in background. You can close this dialog.
              </p>
            </>
          )}

          {status === 'done' && (
            <div className="flex items-center gap-2 text-sm text-status-ok">
              <CheckCircle2 className="size-4" />
              All chapters generated!
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-center gap-2 text-sm text-status-error">
              <XCircle className="size-4" />
              {error ?? 'Generation failed'}
            </div>
          )}

          {status === 'cancelled' && (
            <div className="flex items-center gap-2 text-sm text-content-muted">
              <XCircle className="size-4" />
              Generation cancelled
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
