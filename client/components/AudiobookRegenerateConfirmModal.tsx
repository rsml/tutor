import { AlertTriangle } from 'lucide-react'
import { Button } from '@client/components/ui/button'
import {
  Dialog,
  ScrollableDialogContent,
  ScrollableDialogHeader,
  ScrollableDialogBody,
  ScrollableDialogFooter,
  DialogTitle,
} from '@client/components/ui/dialog'

interface AudiobookRegenerateConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookTitle: string
  // Called on "Replace existing" — parent opens the voice modal.
  onConfirm: () => void
}

export function AudiobookRegenerateConfirmModal({
  open,
  onOpenChange,
  bookTitle,
  onConfirm,
}: AudiobookRegenerateConfirmModalProps) {
  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-md">
        <ScrollableDialogHeader>
          <DialogTitle>Generate a new audiobook?</DialogTitle>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>
          <p className="text-sm text-content-primary">
            This will permanently delete the existing audiobook for{' '}
            <span className="font-medium">{bookTitle}</span> — including the M4B
            file and every chapter recording — and start a fresh generation with
            your selected voice.
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-sm text-amber-600">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <span>
              You can't undo this. Generating a new audiobook from scratch takes a few
              minutes.
            </span>
          </div>
        </ScrollableDialogBody>
        <ScrollableDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Replace existing
          </Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
