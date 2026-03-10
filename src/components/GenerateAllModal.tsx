import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, ChevronDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@src/components/ui/dialog'
import { apiUrl } from '@src/lib/api-base'

interface GenerateAllModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  bookTitle: string
  totalChapters: number
}

export function GenerateAllModal({ open, onOpenChange, taskId, bookTitle, totalChapters }: GenerateAllModalProps) {
  const [current, setCurrent] = useState(0)
  const [status, setStatus] = useState<'running' | 'done' | 'error' | 'cancelled'>('running')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !taskId) return

    const evtSource = new EventSource(apiUrl('/api/tasks/stream'))

    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        // Filter to our task
        if (event.taskId && event.taskId !== taskId) return
        if (event.task && event.task.id !== taskId) return

        switch (event.type) {
          case 'task_progress':
            setCurrent(event.progress.current)
            break
          case 'task_done':
            setStatus('done')
            // Auto-close after brief delay
            setTimeout(() => onOpenChange(false), 1500)
            break
          case 'task_error':
            setStatus('error')
            setError(event.error)
            break
          case 'task_cancelled':
            setStatus('cancelled')
            setTimeout(() => onOpenChange(false), 1000)
            break
          case 'task_created':
            if (event.task.id === taskId) {
              setCurrent(event.task.progress.current)
            }
            break
        }
      } catch { /* ignore parse errors */ }
    }

    return () => evtSource.close()
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
            <div className="flex items-center gap-2 text-sm text-green-500">
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
