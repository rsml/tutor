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
  // Which components need downloading — drives the body copy.
  missing: { model: boolean; ffmpeg: boolean }
  // Total bytes that will be downloaded — used in the button label.
  missingBytes: number
  // Called when the user confirms; parent fires the install request.
  onConfirm: () => void
}

function formatMB(bytes: number): string {
  return String(Math.round(bytes / (1024 * 1024)))
}

// Sizes mirror the constants in server/services/audiobook-installer.ts so
// per-component labels stay consistent with the total in the button.
const KOKORO_MB = 115
const FFMPEG_MB = 80

export function AudiobookDownloadModal({
  open,
  onOpenChange,
  missing,
  missingBytes,
  onConfirm,
}: AudiobookDownloadModalProps) {
  const totalMb = formatMB(missingBytes)

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
            Download Missing Components
          </DialogTitle>
          <DialogDescription>
            Tutor can generate audiobooks for you — completely free and totally
            on your computer. To make this happen, it needs to install
            {missing.model && missing.ffmpeg ? ' two things:' : ' one thing:'}
          </DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>
          <ul className="text-sm text-content-primary space-y-2.5">
            {missing.model && (
              <li className="flex items-baseline gap-2">
                <span className="size-1.5 rounded-full bg-content-muted shrink-0 translate-y-[-2px]" />
                <span>
                  <span className="font-medium">Kokoro</span> — a text-to-speech
                  engine (about {KOKORO_MB} MB)
                </span>
              </li>
            )}
            {missing.ffmpeg && (
              <li className="flex items-baseline gap-2">
                <span className="size-1.5 rounded-full bg-content-muted shrink-0 translate-y-[-2px]" />
                <span>
                  <span className="font-medium">FFmpeg</span> — used to stitch
                  the audio files together (about {FFMPEG_MB} MB)
                </span>
              </li>
            )}
          </ul>
          <p className="text-sm text-content-muted mt-4">
            The download happens in the background, so you can keep using Tutor
            while it finishes. Would you like to proceed?
          </p>
        </ScrollableDialogBody>
        <ScrollableDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            <Download className="size-4" data-icon="inline-start" />
            Download ({totalMb} MB)
          </Button>
        </ScrollableDialogFooter>
      </ScrollableDialogContent>
    </Dialog>
  )
}
