/**
 * Everything the user has chosen about how the app behaves.
 *
 * Provider and model selection, reading typography, library sorting and
 * filtering. API keys are never held here in usable form, the field only ever
 * says whether a key exists, because the key itself lives in the OS keychain.
 */
import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ProviderId, AiFunctionGroup } from '@client/lib/providers'
import { IMAGE_MODELS } from '@client/lib/providers'
import type { RootState } from './index'

export interface ProviderConfig {
  apiKey: string | null
  model: string
}

export interface FunctionModelOverride {
  provider: ProviderId
  model: string
}

export interface LibrarySort {
  field: 'date' | 'title' | 'rating' | 'progress' | 'recent' | 'manual'
  direction: 'asc' | 'desc'
}

export interface LibraryFilters {
  status: 'all' | 'in-progress' | 'not-started' | 'finished' | 'unfinished'
  tags: string[]
  ratingMin: number | null
  datePreset: 'any' | 'week' | 'month' | '3months'
}

type LibraryView = 'grid' | 'list'

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  status: 'all',
  tags: [],
  ratingMin: null,
  datePreset: 'any',
}

export const READING_WIDTHS = [560, 640, 768, 896, 1024, 99999] as const
export const DEFAULT_READING_WIDTH = 768

export interface SettingsState {
  // Legacy fields (ignored after migration)
  apiKey?: string | null
  model?: string
  /** @deprecated Use libraryFilters.status instead */
  libraryTab?: 'all' | 'in-progress' | 'not-started' | 'finished'
  // Multi-provider
  activeProvider: ProviderId
  providers: Record<ProviderId, ProviderConfig>
  functionModels: Partial<Record<AiFunctionGroup, FunctionModelOverride>>
  modelAssignmentSeen: boolean
  fontSize: number
  readingWidth: number
  quizLength: number
  defaultChapterCount: number
  advancedMode: boolean
  textureEnabled: boolean
  textureOpacity: number
  librarySort: LibrarySort
  libraryView: LibraryView
  libraryFilters: LibraryFilters
  lastViewedBookId: string | null
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    activeProvider: 'anthropic',
    providers: {
      anthropic: { apiKey: null, model: 'claude-sonnet-4-6' },
      openai: { apiKey: null, model: 'gpt-4o' },
      google: { apiKey: null, model: 'gemini-2.0-flash' },
    },
    functionModels: {},
    modelAssignmentSeen: false,
    fontSize: 16,
    readingWidth: 768,
    quizLength: 3,
    defaultChapterCount: 12,
    advancedMode: false,
    textureEnabled: true,
    textureOpacity: 1,
    librarySort: { field: 'date', direction: 'desc' } as LibrarySort,
    libraryView: 'grid' as LibraryView,
    libraryFilters: { ...DEFAULT_LIBRARY_FILTERS },
    lastViewedBookId: null,
  } as SettingsState,
  reducers: {
    setActiveProvider(state, action: PayloadAction<ProviderId>) {
      state.activeProvider = action.payload
    },
    setProviderApiKey(state, action: PayloadAction<{ provider: ProviderId; apiKey: string | null }>) {
      state.providers[action.payload.provider].apiKey = action.payload.apiKey ? 'configured' : null
    },
    setProviderModel(state, action: PayloadAction<{ provider: ProviderId; model: string }>) {
      state.providers[action.payload.provider].model = action.payload.model
    },
    setFontSize(state, action: PayloadAction<number>) {
      state.fontSize = action.payload
    },
    setReadingWidth(state, action: PayloadAction<number>) {
      state.readingWidth = action.payload
    },
    setQuizLength(state, action: PayloadAction<number>) {
      state.quizLength = action.payload
    },
    setDefaultChapterCount(state, action: PayloadAction<number>) {
      state.defaultChapterCount = action.payload
    },
    setAdvancedMode(state, action: PayloadAction<boolean>) {
      state.advancedMode = action.payload
    },
    setTextureEnabled(state, action: PayloadAction<boolean>) {
      state.textureEnabled = action.payload
    },
    setTextureOpacity(state, action: PayloadAction<number>) {
      state.textureOpacity = action.payload
    },
    setLibrarySort(state, action: PayloadAction<LibrarySort>) {
      state.librarySort = action.payload
    },
    setLibraryView(state, action: PayloadAction<LibraryView>) {
      state.libraryView = action.payload
    },
    setLibraryFilters(state, action: PayloadAction<Partial<LibraryFilters>>) {
      state.libraryFilters = { ...state.libraryFilters, ...action.payload }
    },
    clearLibraryFilters(state) {
      state.libraryFilters = { ...DEFAULT_LIBRARY_FILTERS }
    },
    setFunctionModel(state, action: PayloadAction<{ group: AiFunctionGroup; override: FunctionModelOverride }>) {
      if (!state.functionModels) state.functionModels = {}
      state.functionModels[action.payload.group] = action.payload.override
    },
    clearFunctionModel(state, action: PayloadAction<{ group: AiFunctionGroup }>) {
      if (state.functionModels) delete state.functionModels[action.payload.group]
    },
    setModelAssignmentSeen(state, action: PayloadAction<boolean>) {
      state.modelAssignmentSeen = action.payload
    },
    setLastViewedBookId(state, action: PayloadAction<string | null>) {
      state.lastViewedBookId = action.payload
    },
  },
})

export const {
  setActiveProvider,
  setProviderApiKey,
  setProviderModel,
  setFontSize,
  setReadingWidth,
  setQuizLength,
  setDefaultChapterCount,
  setAdvancedMode,
  setTextureEnabled,
  setTextureOpacity,
  setLibrarySort,
  setLibraryView,
  setLibraryFilters,
  clearLibraryFilters,
  setFunctionModel,
  clearFunctionModel,
  setModelAssignmentSeen,
  setLastViewedBookId,
} = settingsSlice.actions

// Derived selectors — return active provider's key/model
export const selectHasApiKey = (state: RootState) => !!state.settings.providers[state.settings.activeProvider]?.apiKey
export const selectActiveProvider = (state: RootState) => state.settings.activeProvider
export const selectProviders = (state: RootState) => state.settings.providers
export const selectFontSize = (state: RootState) => state.settings.fontSize
export const selectReadingWidth = (state: RootState) => {
  const w = state.settings.readingWidth
  return READING_WIDTHS.includes(w as typeof READING_WIDTHS[number]) ? w : DEFAULT_READING_WIDTH
}
export const selectQuizLength = (state: RootState) => state.settings.quizLength ?? 3
export const selectDefaultChapterCount = (state: RootState) => state.settings.defaultChapterCount ?? 12
export const selectAdvancedMode = (state: RootState) => state.settings.advancedMode ?? false
export const selectTextureEnabled = (state: RootState) => state.settings.textureEnabled
export const selectTextureOpacity = (state: RootState) => state.settings.textureOpacity
export const selectLibrarySort = (state: RootState) => state.settings.librarySort
export const selectLibraryView = (state: RootState) => state.settings.libraryView
export const selectLibraryFilters = (state: RootState) => state.settings.libraryFilters
export const selectModelAssignmentSeen = (state: RootState) => state.settings.modelAssignmentSeen
export const selectLastViewedBookId = (state: RootState) => state.settings.lastViewedBookId ?? null
export const selectFunctionModel = (group: AiFunctionGroup) =>
  createSelector(
    (state: RootState) => state.settings,
    (settings): { provider: ProviderId; model: string } => {
      const override = settings.functionModels?.[group]
      if (override) return override

      // For image group, don't fall back to activeProvider (it may not support images)
      if (group === 'image') {
        const imageProviders = Object.keys(IMAGE_MODELS) as ProviderId[]
        const withKey = imageProviders.find(p => !!settings.providers[p]?.apiKey)
        const fallback = withKey ?? imageProviders[0] ?? 'openai'
        const models = IMAGE_MODELS[fallback]
        return { provider: fallback, model: models?.[0]?.value ?? '' }
      }

      const p = settings.activeProvider
      return { provider: p, model: settings.providers[p]?.model ?? '' }
    },
  )

// Checks whether the provider RESOLVED for a given AI function has a key.
// Necessary because selectFunctionModel(group) may return an override provider
// that differs from settings.activeProvider — selectHasApiKey only sees the
// active provider, so a UI gated on it can enable an action whose request
// would then fail with "invalid x-api-key" against the override's provider.
export const selectHasApiKeyForFunction = (group: AiFunctionGroup) => {
  const fnModel = selectFunctionModel(group)
  return createSelector(
    fnModel,
    (state: RootState) => state.settings.providers,
    ({ provider }, providers) => !!providers[provider]?.apiKey,
  )
}

export const settingsReducer = settingsSlice.reducer
