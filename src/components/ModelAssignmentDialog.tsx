import {
  Dialog,
  ScrollableDialogContent,
  ScrollableDialogHeader,
  ScrollableDialogBody,
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
  setActiveProvider,
  setProviderModel,
} from '@src/store'
import { PROVIDERS, PROVIDER_IDS, FUNCTION_GROUPS, IMAGE_MODELS, type ProviderId, type AiFunctionGroup } from '@src/lib/providers'

interface ModelAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModelAssignmentDialog({ open, onOpenChange }: ModelAssignmentDialogProps) {
  const dispatch = useAppDispatch()
  const activeProvider = useAppSelector(selectActiveProvider)
  const providers = useAppSelector(selectProviders)
  const functionModels = useAppSelector(state => state.settings.functionModels ?? {})

  const currentModel = providers[activeProvider]?.model

  const handleDefaultChange = (value: string) => {
    const [provider, ...modelParts] = value.split(':')
    const pid = provider as ProviderId
    dispatch(setActiveProvider(pid))
    dispatch(setProviderModel({ provider: pid, model: modelParts.join(':') }))
  }

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
      <ScrollableDialogContent className="sm:max-w-md">
        <ScrollableDialogHeader>
          <DialogTitle>Model Assignment</DialogTitle>
          <DialogDescription>
            Choose which models to use for different features
          </DialogDescription>
        </ScrollableDialogHeader>
        <ScrollableDialogBody>

        <div className="space-y-4">
          <div className="grid gap-1">
            <div className="flex items-baseline gap-2">
              <label htmlFor="fn-model-default" className="text-sm font-medium text-content-primary">
                Default
              </label>
              <span className="text-xs text-content-muted">Fallback for all functions</span>
            </div>
            <select
              id="fn-model-default"
              value={`${activeProvider}:${currentModel}`}
              onChange={e => handleDefaultChange(e.target.value)}
              className="h-9 rounded-lg border border-border-default bg-surface-raised px-3 text-sm text-content-primary outline-none transition-colors focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
            >
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

          {FUNCTION_GROUPS.map(group => {
            const isImage = group.id === 'image'
            return (
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
                  <option value="default">{isImage ? 'Default (OpenAI DALL-E 3)' : 'Default'}</option>
                  {isImage ? (
                    // Image group: show only providers with image models
                    PROVIDER_IDS.filter(pid => IMAGE_MODELS[pid]).map(pid => {
                      const def = PROVIDERS[pid]
                      const hasKey = !!providers[pid]?.apiKey
                      const models = IMAGE_MODELS[pid]!
                      return (
                        <optgroup key={pid} label={def.name}>
                          {models.map(m => (
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
                    })
                  ) : (
                    // Text groups: show all providers
                    PROVIDER_IDS.map(pid => {
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
                    })
                  )}
                </select>
              </div>
            )
          })}
        </div>
        </ScrollableDialogBody>
      </ScrollableDialogContent>
    </Dialog>
  )
}
