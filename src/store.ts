import { combineReducers, configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist'
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

const rootReducer = combineReducers({
  readingProgress: readingProgressSlice.reducer,
})

const persistedReducer = persistReducer(
  { key: 'tutor', storage },
  rootReducer,
)

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
