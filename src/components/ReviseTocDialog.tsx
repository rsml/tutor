import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  ScrollableDialogContent,
  ScrollableDialogHeader,
  ScrollableDialogBody,
  ScrollableDialogFooter,
  DialogTitle,
  DialogDescription,
} from '@src/components/ui/dialog'
import { Button } from '@src/components/ui/button'

interface ReviseTocDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (feedback: string) => void
  submitting?: boolean
}

export function ReviseTocDialog({ open, onOpenChange, onSubmit, submitting }: ReviseTocDialogProps) {
  const [feedback, setFeedback] = useState('')

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setFeedback('')
    }
  }, [open])

  const handleSubmit = () => {
    const trimmed = feedback.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setFeedback('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-lg">
        <ScrollableDialogHeader>
          <DialogTitle>Revise Table of Contents</DialogTitle>
          <DialogDescription>
            Describe the changes you'd like. Untouched chapters will be preserved.
          </DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="e.g., merge chapters 5 and 6, add a chapter on X between 3 and 4, rename 'Foundations' to something punchier"
            rows={6}
            autoFocus
            className="w-full min-h-[8rem] rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
          />
        </ScrollableDialogBody>
        <ScrollableDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!feedback.trim() || submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
            Revise
          </Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
