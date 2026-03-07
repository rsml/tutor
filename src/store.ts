import { combineReducers, configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { persistStore, persistReducer, createTransform, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist'
import storage from 'redux-persist/lib/storage'

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

interface SettingsState {
  apiKey: string | null
  model: string
  fontSize: number
  textureEnabled: boolean
  textureOpacity: number
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    apiKey: null,
    model: 'claude-sonnet-4-20250514',
    fontSize: 16,
    textureEnabled: true,
    textureOpacity: 1,
  } as SettingsState,
  reducers: {
    setApiKey(state, action: PayloadAction<string | null>) {
      state.apiKey = action.payload
    },
    setModel(state, action: PayloadAction<string>) {
      state.model = action.payload
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

export const { setApiKey, setModel, setFontSize, setTextureEnabled, setTextureOpacity } = settingsSlice.actions
export const selectApiKey = (state: RootState) => state.settings.apiKey
export const selectModel = (state: RootState) => state.settings.model
export const selectFontSize = (state: RootState) => state.settings.fontSize
export const selectTextureEnabled = (state: RootState) => state.settings.textureEnabled
export const selectTextureOpacity = (state: RootState) => state.settings.textureOpacity

const rootReducer = combineReducers({
  readingProgress: readingProgressSlice.reducer,
  settings: settingsSlice.reducer,
})

// Use Electron IPC storage when available, otherwise fall back to localStorage
const electronStorage = window.electronAPI?.storageGet
  ? {
      getItem: (key: string) => window.electronAPI!.storageGet(key),
      setItem: (key: string, value: string) => window.electronAPI!.storageSet(key, value),
      removeItem: (key: string) => window.electronAPI!.storageRemove(key),
    }
  : storage

// Strip apiKey from settings before persisting — it's stored encrypted via safeStorage
const stripApiKeyTransform = createTransform(
  (inbound: SettingsState) => ({ ...inbound, apiKey: null }),
  (outbound: SettingsState) => outbound,
  { whitelist: ['settings'] },
)

const persistConfig = {
  key: 'tutor',
  storage: electronStorage,
  transforms: [stripApiKeyTransform],
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
