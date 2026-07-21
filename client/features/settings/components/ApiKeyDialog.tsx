import type { RefObject } from 'react'
import { Check, CheckCircle2, Trash2 } from 'lucide-react'
import { Button } from '@client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@client/components/ui/dialog'
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from '@client/lib/providers'
import type { ProviderConfig } from '@client/store'

interface ApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  providers: Record<ProviderId, ProviderConfig>
  activeProvider: ProviderId
  onActiveProviderChange: (provider: ProviderId) => void
  dialogProvider: ProviderId
  onSelectDialogProvider: (provider: ProviderId) => void
  keyInputs: Partial<Record<ProviderId, string>>
  onKeyInputChange: (provider: ProviderId, value: string) => void
  onRemove: (provider: ProviderId) => void
  apiKeyInputRef: RefObject<HTMLInputElement | null>
}

/** The "AI Provider" dialog: default-provider selector, per-provider tabs, and the API key field for whichever tab is selected. */
export function ApiKeyDialog({
  open,
  onOpenChange,
  providers,
  activeProvider,
  onActiveProviderChange,
  dialogProvider,
  onSelectDialogProvider,
  keyInputs,
  onKeyInputChange,
  onRemove,
  apiKeyInputRef,
}: ApiKeyDialogProps) {
  const dialogDef = PROVIDERS[dialogProvider]
  const dialogConfig = providers[dialogProvider]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>AI Provider</DialogTitle>
          <DialogDescription>
            Configure API keys for each provider independently.
          </DialogDescription>
        </DialogHeader>

        {/* Default provider selector */}
        {PROVIDER_IDS.some(id => !!providers[id]?.apiKey) && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-content-muted whitespace-nowrap">Default Text Provider</label>
            <select
              value={activeProvider}
              onChange={e => onActiveProviderChange(e.target.value as ProviderId)}
              className="flex-1 h-7 rounded-md border border-border-default bg-surface-raised px-2 text-xs text-content-primary outline-none transition-colors focus:border-border-focus"
            >
              {PROVIDER_IDS.filter(id => !!providers[id]?.apiKey).map(id => (
                <option key={id} value={id}>{PROVIDERS[id].name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Provider tabs */}
        <div className="flex gap-1.5">
          {PROVIDER_IDS.map(id => {
            const def = PROVIDERS[id]
            const hasKey = !!providers[id]?.apiKey
            const isSelected = dialogProvider === id
            const isActive = activeProvider === id && hasKey
            return (
              <button
                key={id}
                onClick={() => onSelectDialogProvider(id)}
                className={`relative flex-1 rounded-lg border px-3 py-2.5 text-center transition-colors ${
                  isSelected
                    ? 'border-border-focus bg-surface-muted text-content-primary'
                    : 'border-border-default text-content-muted hover:border-border-focus/50 hover:text-content-secondary'
                }`}
              >
                <div className="flex items-center justify-center gap-1 text-xs font-semibold">
                  {def.name}
                  {hasKey && <CheckCircle2 className="size-3 text-status-ok" />}
                </div>
                <div className="text-[10px] text-content-muted mt-0.5">
                  {hasKey ? def.label : '(no key)'}
                </div>
                {isActive && (
                  <Check className="absolute top-1 right-1 size-3 text-status-ok" />
                )}
              </button>
            )
          })}
        </div>

        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <label htmlFor="api-key" className="text-sm font-medium text-content-primary">
              API Key
            </label>
            <div className="relative">
              <input
                ref={apiKeyInputRef}
                id="api-key"
                type="password"
                value={keyInputs[dialogProvider] ?? ''}
                onChange={e => onKeyInputChange(dialogProvider, e.target.value)}
                placeholder={dialogConfig?.apiKey ? 'Key saved (enter new to replace)' : dialogDef.placeholder}
                className={`h-9 w-full rounded-lg border border-border-default bg-surface-raised px-3 ${dialogConfig?.apiKey ? 'pr-9' : ''} font-mono text-sm text-content-primary placeholder:text-content-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20`}
              />
              {dialogConfig?.apiKey && (
                <button
                  type="button"
                  onClick={() => onRemove(dialogProvider)}
                  aria-label={`Remove ${dialogDef.name} API key`}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center size-6 rounded-md text-content-muted hover:text-status-danger hover:bg-surface-muted transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
