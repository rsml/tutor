import { useEffect, useMemo } from 'react'
import { useAppDispatch, useAppSelector, selectProviderModels, providerModelsLoading, providerModelsSuccess, providerModelsError } from '@client/store'
import { PROVIDERS, IMAGE_MODELS, type ProviderId, type ModelOption } from '@client/lib/providers'
import { apiUrl } from '@client/lib/api-base'

interface UseProviderModelsResult {
  chat: ModelOption[]
  image: ModelOption[]
  status: 'idle' | 'loading' | 'success' | 'error'
  /** True when the list came from the upstream API (not the static fallback). */
  isLive: boolean
}

const inflight = new Set<ProviderId>()

/**
 * Returns chat + image model lists for the given provider. Lazily fetches the
 * upstream `/v1/models` list the first time it's needed for a provider with an
 * API key configured. Falls back to the static lists in providers.ts when the
 * fetch hasn't run, is in flight, or failed.
 */
export function useProviderModels(provider: ProviderId): UseProviderModelsResult {
  const dispatch = useAppDispatch()
  const models = useAppSelector(selectProviderModels(provider))
  const hasKey = useAppSelector(s => !!s.settings.providers[provider]?.apiKey)

  useEffect(() => {
    if (!hasKey) return
    if (models.status === 'success' || models.status === 'loading') return
    if (inflight.has(provider)) return
    inflight.add(provider)
    dispatch(providerModelsLoading(provider))
    fetch(apiUrl(`/api/providers/${provider}/models`))
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ chat: ModelOption[]; image: ModelOption[] }>
      })
      .then(data => {
        dispatch(providerModelsSuccess({ provider, chat: data.chat, image: data.image }))
      })
      .catch(() => {
        dispatch(providerModelsError(provider))
      })
      .finally(() => {
        inflight.delete(provider)
      })
  }, [provider, hasKey, models.status, dispatch])

  return useMemo(() => {
    if (models.status === 'success') {
      return {
        chat: models.chat,
        image: models.image,
        status: models.status,
        isLive: true,
      }
    }
    return {
      chat: PROVIDERS[provider].models,
      image: IMAGE_MODELS[provider] ?? [],
      status: models.status,
      isLive: false,
    }
  }, [provider, models])
}
