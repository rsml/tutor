import type { ModelOption, ProviderId } from '@client/lib/providers'
import { apiFetch, request } from './http'

/**
 * This module covers API keys, the server health check, and the model lists
 * a provider currently offers.
 */

/** Saves an API key for a provider so the server can use it for future requests. */
export function saveApiKey(provider: ProviderId, apiKey: string): Promise<void> {
  return request<void>('/api/settings/api-key', { method: 'POST', body: { provider, apiKey } })
}

/** Removes the stored API key for a provider. */
export function removeApiKey(provider: ProviderId): Promise<void> {
  // This DELETE carries a body on purpose. The server reads the provider
  // from the body, and a query parameter would just be a second way to send
  // the same thing.
  return request<void>('/api/settings/api-key', { method: 'DELETE', body: { provider } })
}

/** Reports which providers currently have an API key configured on the server. */
export function getApiKeyStatus(): Promise<Record<ProviderId, boolean>> {
  return request<Record<ProviderId, boolean>>('/api/settings/api-key-status', { method: 'GET' })
}

/** Checks whether the server is reachable, and never throws while doing it. */
export async function checkHealth(): Promise<boolean> {
  try {
    // This poll runs on a ten second interval. Passing trace as false keeps
    // the request CORS-simple, since the trace header would otherwise force
    // a preflight on every one of them.
    const response = await apiFetch('/api/health', { method: 'GET', trace: false })
    return response.ok
  } catch {
    // A poller has no use for a thrown error, so a transport failure counts
    // the same as an unreachable server.
    return false
  }
}

/** Lists the chat and image models a provider currently offers. */
export function getProviderModels(provider: ProviderId): Promise<{ chat: ModelOption[]; image: ModelOption[] }> {
  return request<{ chat: ModelOption[]; image: ModelOption[] }>(`/api/providers/${provider}/models`, { method: 'GET' })
}
