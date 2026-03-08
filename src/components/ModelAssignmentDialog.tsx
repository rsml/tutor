import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@src/components/ui/dialog'
import {
  useAppDispatch,
  useAppSelector,
  selectActiveProvider,
  selectProviders,
  setFunctionModel,
  clearFunctionModel,
} from '@src/store'
import { PROVIDERS, PROVIDER_IDS, FUNCTION_GROUPS, type ProviderId, type AiFunctionGroup } from '@src/lib/providers'

interface ModelAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModelAssignmentDialog({ open, onOpenChange }: ModelAssignmentDialogProps) {
  const dispatch = useAppDispatch()
  const activeProvider = useAppSelector(selectActiveProvider)
  const providers = useAppSelector(selectProviders)
  const functionModels = useAppSelector(state => state.settings.functionModels ?? {})

  const activeDef = PROVIDERS[activeProvider]
  const activeModelLabel = activeDef.models.find(m => m.value === providers[activeProvider]?.model)?.label ?? providers[activeProvider]?.model

  const handleChange = (group: AiFunctionGroup, value: string) => {
    if (value === 'default') {
      dispatch(clearFunctionModel({ group }))
    } else {
      const [provider, ...modelParts] = value.split(':')
      dispatch(setFunctionModel({
        group,
        override: { provider: provider as ProviderId, model: modelParts.join(':') },
      }))
    }
  }

  const getSelectValue = (group: AiFunctionGroup): string => {
    const override = functionModels[group]
    if (!override) return 'default'
    return `${override.provider}:${override.model}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Model Assignment</DialogTitle>
          <DialogDescription>
            Assign different models to different functions. Unset groups use the default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-lg border border-border-default/50 bg-surface-muted/30 px-3 py-2 text-xs text-content-muted">
          <span className="font-medium text-content-secondary">Default:</span>{' '}
          {activeDef.name} / {activeModelLabel}
        </div>

        <div className="space-y-3">
          {FUNCTION_GROUPS.map(group => (
            <div key={group.id} className="grid gap-1">
              <div className="flex items-baseline gap-2">
                <label htmlFor={`fn-model-${group.id}`} className="text-sm font-medium text-content-primary">
                  {group.label}
                </label>
                <span className="text-xs text-content-muted">{group.description}</span>
              </div>
              <select
                id={`fn-model-${group.id}`}
                value={getSelectValue(group.id)}
                onChange={e => handleChange(group.id, e.target.value)}
                className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
              >
                <option value="default">Default</option>
                {PROVIDER_IDS.map(pid => {
                  const def = PROVIDERS[pid]
                  const hasKey = !!providers[pid]?.apiKey
                  return (
                    <optgroup key={pid} label={def.name}>
                      {def.models.map(m => (
                        <option
                          key={`${pid}:${m.value}`}
                          value={`${pid}:${m.value}`}
                          disabled={!hasKey}
                        >
                          {m.label}{!hasKey ? ' (no key)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
