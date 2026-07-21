/**
 * Model lists discovered from each provider's own catalogue endpoint.
 *
 * Cached in memory per provider so the settings UI can offer real model names
 * rather than a hard coded list that goes stale.
 */
import { createSlice } from '@reduxjs/toolkit'
import type { ProviderId, ModelOption } from '@client/lib/providers'
import type { RootState } from './index'

// --- Provider Models (auto-detected from upstream /v1/models) ---

export interface ProviderModelList {
  status: 'idle' | 'loading' | 'success' | 'error'
  chat: ModelOption[]
  image: ModelOption[]
  fetchedAt?: number
}

const initialProviderModels: ProviderModelList = { status: 'idle', chat: [], image: [] }

const providerModelsSlice = createSlice({
  name: 'providerModels',
  initialState: {} as Partial<Record<ProviderId, ProviderModelList>>,
  reducers: {
    providerModelsLoading: (state, action: { payload: ProviderId }) => {
      state[action.payload] = { ...(state[action.payload] ?? initialProviderModels), status: 'loading' }
    },
    providerModelsSuccess: (state, action: { payload: { provider: ProviderId; chat: ModelOption[]; image: ModelOption[] } }) => {
      state[action.payload.provider] = {
        status: 'success',
        chat: action.payload.chat,
        image: action.payload.image,
        fetchedAt: Date.now(),
      }
    },
    providerModelsError: (state, action: { payload: ProviderId }) => {
      state[action.payload] = { ...(state[action.payload] ?? initialProviderModels), status: 'error' }
    },
  },
})

export const { providerModelsLoading, providerModelsSuccess, providerModelsError } = providerModelsSlice.actions
export const selectProviderModels = (provider: ProviderId) => (state: RootState): ProviderModelList =>
  state.providerModels[provider] ?? initialProviderModels

export const providerModelsReducer = providerModelsSlice.reducer
