import type { Dispatch } from 'react'
import { Button } from '@client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@client/components/ui/dialog'
import { StarRating } from '@client/features/reader/components/StarRating'
import type { DialogAction, LibraryDialog } from '@client/features/library/dialogs/dialog-machine'

interface RateBookDialogProps {
  open: boolean
  payload: Extract<LibraryDialog, { kind: 'rate' }> | null
  dispatch: Dispatch<DialogAction>
  mutating: boolean
  onConfirm: () => void
  onClearRating: () => void
}

/** Always mounted, same reason as RenameBookDialog: `open` from isOpen, the
 * visible book title and in-progress star rating from payloadOf so they
 * survive into the fade. */
export function RateBookDialog({ open, payload, dispatch, mutating, onConfirm, onClearRating }: RateBookDialogProps) {
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) dispatch({ type: 'close' }) }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Rate Book</DialogTitle>
          <DialogDescription>{payload?.book.title}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2 py-4">
          <StarRating
            value={payload?.rating ?? 0}
            onChange={val => dispatch({ type: 'edit', patch: { rating: val } })}
            size="lg"
          />
          {payload && payload.book.rating != null && payload.book.rating > 0 && (
            <button
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={onClearRating}
              disabled={mutating}
            >
              Clear rating
            </button>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => dispatch({ type: 'close' })}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!payload?.rating || mutating}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
