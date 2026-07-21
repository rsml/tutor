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

interface RenameSeriesDialogProps {
  open: boolean
  payload: Extract<LibraryDialog, { kind: 'renameSeries' }> | null
  dispatch: Dispatch<DialogAction>
  mutating: boolean
  onConfirm: () => void
}

/** Always mounted, same reason as RenameBookDialog: `open` from isOpen, the
 * visible book count and name from payloadOf so they survive into the fade. */
export function RenameSeriesDialog({ open, payload, dispatch, mutating, onConfirm }: RenameSeriesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) dispatch({ type: 'close' }) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename Series</DialogTitle>
          <DialogDescription>
            This will update the series name on {payload?.books.length ?? 0} {(payload?.books.length ?? 0) === 1 ? 'book' : 'books'}.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label className="text-xs font-medium text-content-muted mb-1 block">Series Name</label>
          <input
            value={payload?.newName ?? ''}
            onChange={e => dispatch({ type: 'edit', patch: { newName: e.target.value } })}
            onKeyDown={e => e.key === 'Enter' && onConfirm()}
            className="h-9 w-full rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => dispatch({ type: 'close' })}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!payload?.newName.trim() || mutating}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
