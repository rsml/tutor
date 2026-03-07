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
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: { apiKey: null, model: 'claude-sonnet-4-20250514' } as SettingsState,
  reducers: {
    setApiKey(state, action: PayloadAction<string | null>) {
      state.apiKey = action.payload
    },
    setModel(state, action: PayloadAction<string>) {
      state.model = action.payload
    },
  },
})

export const { setApiKey, setModel } = settingsSlice.actions
export const selectApiKey = (state: RootState) => state.settings.apiKey
export const selectModel = (state: RootState) => state.settings.model

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

const persistedReducer = persistReducer(persistConfig, rootReducer)

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
