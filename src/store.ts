import { combineReducers, configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { persistStore, persistReducer, createTransform, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist'
import storage from 'redux-persist/lib/storage'
import type { ProviderId } from '@src/lib/providers'

interface QuizResult {
  questions: Array<{
    question: string
    options: string[]
    correctIndex: number
    userAnswer?: number
    correct?: boolean
  }>
  score: number
}

interface ChapterFeedback {
  liked: string
  disliked: string
}

// bookId -> chapterNum (string) -> data
interface ChapterDataState {
  feedback: Record<string, Record<string, ChapterFeedback>>
  quizResults: Record<string, Record<string, QuizResult>>
}

const chapterDataSlice = createSlice({
  name: 'chapterData',
  initialState: { feedback: {}, quizResults: {} } as ChapterDataState,
  reducers: {
    setChapterFeedback(state, action: PayloadAction<{ bookId: string; chapterNum: number; liked: string; disliked: string }>) {
      const { bookId, chapterNum, liked, disliked } = action.payload
      if (!state.feedback[bookId]) state.feedback[bookId] = {}
      state.feedback[bookId][String(chapterNum)] = { liked, disliked }
    },
    setChapterQuizResult(state, action: PayloadAction<{ bookId: string; chapterNum: number; result: QuizResult }>) {
      const { bookId, chapterNum, result } = action.payload
      if (!state.quizResults[bookId]) state.quizResults[bookId] = {}
      state.quizResults[bookId][String(chapterNum)] = result
    },
  },
})

export const { setChapterFeedback, setChapterQuizResult } = chapterDataSlice.actions

export const selectChapterFeedback = (bookId: string, chapterNum: number) =>
  (state: RootState) => state.chapterData.feedback[bookId]?.[String(chapterNum)] ?? null

export const selectChapterQuizResult = (bookId: string, chapterNum: number) =>
  (state: RootState) => state.chapterData.quizResults[bookId]?.[String(chapterNum)] ?? null

interface ReadingProgressState {
  positions: Record<string, number>
  furthest: Record<string, number>
}

const readingProgressSlice = createSlice({
  name: 'readingProgress',
  initialState: { positions: {}, furthest: {} } as ReadingProgressState,
  reducers: {
    setChapterPosition(state, action: PayloadAction<{ bookId: string; chapterIndex: number }>) {
      state.positions[action.payload.bookId] = action.payload.chapterIndex
      const prev = state.furthest[action.payload.bookId] ?? -1
      if (action.payload.chapterIndex > prev) {
        state.furthest[action.payload.bookId] = action.payload.chapterIndex
      }
    },
  },
})

export const { setChapterPosition } = readingProgressSlice.actions

interface ProviderConfig {
  apiKey: string | null
  model: string
}

interface SettingsState {
  // Legacy fields (ignored after migration)
  apiKey?: string | null
  model?: string
  // Multi-provider
  activeProvider: ProviderId
  providers: Record<ProviderId, ProviderConfig>
  fontSize: number
  textureEnabled: boolean
  textureOpacity: number
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    activeProvider: 'anthropic',
    providers: {
      anthropic: { apiKey: null, model: 'claude-sonnet-4-20250514' },
      openai: { apiKey: null, model: 'gpt-4o' },
      google: { apiKey: null, model: 'gemini-2.0-flash' },
    },
    fontSize: 16,
    textureEnabled: true,
    textureOpacity: 1,
  } as SettingsState,
  reducers: {
    setActiveProvider(state, action: PayloadAction<ProviderId>) {
      state.activeProvider = action.payload
    },
    setProviderApiKey(state, action: PayloadAction<{ provider: ProviderId; apiKey: string | null }>) {
      state.providers[action.payload.provider].apiKey = action.payload.apiKey
    },
    setProviderModel(state, action: PayloadAction<{ provider: ProviderId; model: string }>) {
      state.providers[action.payload.provider].model = action.payload.model
    },
    setFontSize(state, action: PayloadAction<number>) {
      state.fontSize = action.payload
    },
    setTextureEnabled(state, action: PayloadAction<boolean>) {
      state.textureEnabled = action.payload
    },
    setTextureOpacity(state, action: PayloadAction<number>) {
      state.textureOpacity = action.payload
    },
  },
})

export const {
  setActiveProvider,
  setProviderApiKey,
  setProviderModel,
  setFontSize,
  setTextureEnabled,
  setTextureOpacity,
} = settingsSlice.actions

// Derived selectors — return active provider's key/model
export const selectApiKey = (state: RootState) => state.settings.providers[state.settings.activeProvider]?.apiKey ?? null
export const selectModel = (state: RootState) => state.settings.providers[state.settings.activeProvider]?.model ?? ''
export const selectActiveProvider = (state: RootState) => state.settings.activeProvider
export const selectProviders = (state: RootState) => state.settings.providers
export const selectFontSize = (state: RootState) => state.settings.fontSize
export const selectTextureEnabled = (state: RootState) => state.settings.textureEnabled
export const selectTextureOpacity = (state: RootState) => state.settings.textureOpacity

const rootReducer = combineReducers({
  readingProgress: readingProgressSlice.reducer,
  settings: settingsSlice.reducer,
  chapterData: chapterDataSlice.reducer,
})

// Use Electron IPC storage when available, otherwise fall back to localStorage
const electronStorage = window.electronAPI?.storageGet
  ? {
      getItem: (key: string) => window.electronAPI!.storageGet(key),
      setItem: (key: string, value: string) => window.electronAPI!.storageSet(key, value),
      removeItem: (key: string) => window.electronAPI!.storageRemove(key),
    }
  : storage

// Strip all API keys from providers before persisting — stored encrypted via safeStorage
const stripApiKeysTransform = createTransform(
  (inbound: SettingsState) => ({
    ...inbound,
    apiKey: undefined,
    model: undefined,
    providers: {
      anthropic: { ...inbound.providers.anthropic, apiKey: null },
      openai: { ...inbound.providers.openai, apiKey: null },
      google: { ...inbound.providers.google, apiKey: null },
    },
  }),
  (outbound: SettingsState) => {
    // Migrate legacy single apiKey/model to anthropic provider
    if (outbound.apiKey && !outbound.providers) {
      return {
        ...outbound,
        activeProvider: 'anthropic' as ProviderId,
        providers: {
          anthropic: { apiKey: null, model: outbound.model || 'claude-sonnet-4-20250514' },
          openai: { apiKey: null, model: 'gpt-4o' },
          google: { apiKey: null, model: 'gemini-2.0-flash' },
        },
        apiKey: undefined,
        model: undefined,
      }
    }
    return outbound
  },
  { whitelist: ['settings'] },
)

const persistConfig = {
  key: 'tutor',
  storage: electronStorage,
  transforms: [stripApiKeysTransform],
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const persistedReducer = persistReducer(persistConfig, rootReducer as any) as typeof rootReducer

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
})

export const persistor = persistStore(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
