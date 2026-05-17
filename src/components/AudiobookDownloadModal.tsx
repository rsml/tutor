import { Download } from 'lucide-react'
import { Button } from '@src/components/ui/button'
import {
  Dialog,
  ScrollableDialogContent,
  ScrollableDialogHeader,
  ScrollableDialogBody,
  ScrollableDialogFooter,
  DialogTitle,
  DialogDescription,
} from '@src/components/ui/dialog'

interface AudiobookDownloadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Total bytes that will be downloaded — used in body copy and button label.
  missingBytes: number
  // Called when the user confirms; parent fires the install request.
  onConfirm: () => void
}

function formatMB(bytes: number): string {
  return String(Math.round(bytes / (1024 * 1024)))
}

export function AudiobookDownloadModal({
  open,
  onOpenChange,
  missingBytes,
  onConfirm,
}: AudiobookDownloadModalProps) {
  const mb = formatMB(missingBytes)

  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ScrollableDialogContent className="sm:max-w-md">
        <ScrollableDialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-5" />
            Download offline narration?
          </DialogTitle>
          <DialogDescription>
            To turn your books into audiobooks, we need to download a free local
            text-to-speech engine. It's about {mb} MB. After this one-time
            download, you can generate audiobooks anytime — even offline.
          </DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>
          <p className="text-sm text-content-muted mt-3">
            The download happens in the background — you can keep using Tutor while it
            finishes.
          </p>
        </ScrollableDialogBody>
        <ScrollableDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            <Download className="size-4" data-icon="inline-start" />
            Download ({mb} MB)
          </Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
