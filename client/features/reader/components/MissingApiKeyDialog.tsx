interface MissingApiKeyDialogProps {
  onClose: () => void
}

/** The nudge shown over the whole page when the reader tries to use chat
 *  without an API key configured. Both the backdrop and its "Got it" button
 *  dismiss it the same way, matching the single dismiss action it had
 *  before this was its own component. */
export function MissingApiKeyDialog({ onClose }: MissingApiKeyDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-xs"
      onClick={onClose}
    >
      <div className="rounded-xl border border-border-default bg-surface-overlay p-6 shadow-lg" onClick={e => e.stopPropagation()}>
        <p className="text-sm text-content-primary">Set your API key in Settings to use chat features.</p>
        <button
          onClick={onClose}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
