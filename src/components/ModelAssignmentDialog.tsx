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
import { useProviderModels } from '@src/hooks/useProviderModels'

interface ModelAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ProviderOptionGroupProps {
  pid: ProviderId
  kind: 'chat' | 'image'
  hasKey: boolean
}

// Renders <optgroup> for one provider's models. Each instance independently
// triggers a lazy fetch from /api/providers/:pid/models via useProviderModels,
// falling back to the static PROVIDERS list on error or before the fetch resolves.
function ProviderOptionGroup({ pid, kind, hasKey }: ProviderOptionGroupProps) {
  const def = PROVIDERS[pid]
  const { chat, image } = useProviderModels(pid)
  const models = kind === 'image' ? image : chat
  if (kind === 'image' && models.length === 0 && !IMAGE_MODELS[pid]) return null
  return (
    <optgroup label={def.name}>
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
              {PROVIDER_IDS.map(pid => (
                <ProviderOptionGroup
                  key={pid}
                  pid={pid}
                  kind="chat"
                  hasKey={!!providers[pid]?.apiKey}
                />
              ))}
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
                  <option value="default">{isImage ? 'Default (OpenAI GPT Image 1)' : 'Default'}</option>
                  {isImage
                    ? PROVIDER_IDS.filter(pid => IMAGE_MODELS[pid]).map(pid => (
                        <ProviderOptionGroup
                          key={pid}
                          pid={pid}
                          kind="image"
                          hasKey={!!providers[pid]?.apiKey}
                        />
                      ))
                    : PROVIDER_IDS.map(pid => (
                        <ProviderOptionGroup
                          key={pid}
                          pid={pid}
                          kind="chat"
                          hasKey={!!providers[pid]?.apiKey}
                        />
                      ))}
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
