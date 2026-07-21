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
import type { DialogAction, LibraryDialog } from '@client/features/library/dialogs/dialog-machine'

interface ResetBookDialogProps {
  open: boolean
  payload: Extract<LibraryDialog, { kind: 'reset' }> | null
  dispatch: Dispatch<DialogAction>
  mutating: boolean
  onConfirm: () => void
}

/** Always mounted, same reason as RenameBookDialog: `open` from isOpen, the
 * visible title and typed confirmation text from payloadOf so they survive
 * into the fade. */
export function ResetBookDialog({ open, payload, dispatch, mutating, onConfirm }: ResetBookDialogProps) {
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) dispatch({ type: 'close' }) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset Book</DialogTitle>
          <DialogDescription>
            Are you sure you want to reset &ldquo;{payload?.book.title}&rdquo;? This permanently clears your reading progress, rating, feedback, and quiz answers. The chapters and table of contents will remain. Type <strong>reset</strong> to confirm.
          </DialogDescription>
        </DialogHeader>
        <input
          value={payload?.input ?? ''}
          onChange={e => dispatch({ type: 'edit', patch: { input: e.target.value } })}
          onKeyDown={e => e.key === 'Enter' && payload?.input.toLowerCase() === 'reset' && onConfirm()}
          placeholder="reset"
          className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
          autoFocus
          autoCapitalize="off"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => dispatch({ type: 'close' })}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={payload?.input.toLowerCase() !== 'reset' || mutating}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
