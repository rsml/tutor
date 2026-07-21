/**
 * The store itself, and the single public entry point to it.
 *
 * Every component imports state from '@client/store' and never from a slice
 * file directly, which is what lets a slice be renamed or split without
 * touching a single call site.
 */
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist'
import quizHistoryReducer from '@client/store/quizHistorySlice'
import chatHistoryReducer from '@client/store/chatHistorySlice'
import { backgroundTasksReducer } from './backgroundTasks'
import { chapterDataReducer } from './chapterData'
import { persistConfig } from './persist'
import { providerModelsReducer } from './providerModels'
import { readingProgressReducer } from './readingProgress'
import { settingsReducer } from './settings'

const rootReducer = combineReducers({
  readingProgress: readingProgressReducer,
  settings: settingsReducer,
  chapterData: chapterDataReducer,
  quizHistory: quizHistoryReducer,
  chatHistory: chatHistoryReducer,
  backgroundTasks: backgroundTasksReducer,
  providerModels: providerModelsReducer,
})

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

export * from './backgroundTasks'
export * from './chapterData'
export * from './providerModels'
export * from './readingProgress'
export * from './settings'

export { recordQuizAttempt } from '@client/store/quizHistorySlice'
export type { QuizQuestion as QuizHistoryQuestion, QuizAttempt, ChapterQuiz } from '@client/store/quizHistorySlice'

export { setChatMessages, clearChatHistory } from '@client/store/chatHistorySlice'
export { selectChatMessages } from '@client/store/chatHistorySlice'

export {
  selectChapterQuiz,
  selectChapterAttempts,
  selectOverallScore,
  selectChaptersNeedingReview,
  selectChapterSparkline,
  selectSmartReviewQueue,
  selectBookQuizSummary,
  selectPerQuestionCorrectRate,
} from '@client/store/quizHistorySelectors'
