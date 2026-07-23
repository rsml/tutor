import type { Dispatch } from 'react'
import { Button } from '@client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/components/ui/dialog'
import type { DialogAction, LibraryDialog } from '@client/features/library/dialogs/dialog-machine'

interface RenameBookDialogProps {
  open: boolean
  payload: Extract<LibraryDialog, { kind: 'rename' }> | null
  dispatch: Dispatch<DialogAction>
  mutating: boolean
  onConfirm: () => void
}

/** Always mounted so the exit animation has content to fade, per the
 * project's dialog-machine convention: `open` comes from isOpen, the visible
 * title and subtitle come from payloadOf so they survive into the fade. */
export function RenameBookDialog({ open, payload, dispatch, mutating, onConfirm }: RenameBookDialogProps) {
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) dispatch({ type: 'close' }) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename Book</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="rename-book-title" className="text-xs font-medium text-content-muted mb-1 block">Title</label>
            <input
              id="rename-book-title"
              value={payload?.title ?? ''}
              onChange={e => dispatch({ type: 'edit', patch: { title: e.target.value } })}
              onKeyDown={e => e.key === 'Enter' && onConfirm()}
              className="h-9 w-full rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="rename-book-subtitle" className="text-xs font-medium text-content-muted mb-1 block">Subtitle</label>
            <input
              id="rename-book-subtitle"
              value={payload?.subtitle ?? ''}
              onChange={e => dispatch({ type: 'edit', patch: { subtitle: e.target.value } })}
              onKeyDown={e => e.key === 'Enter' && onConfirm()}
              placeholder="Optional subtitle"
              className="h-9 w-full rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => dispatch({ type: 'close' })}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!payload?.title.trim() || mutating}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
