import { combineReducers, configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { persistStore, persistReducer, createTransform, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist'
import storage from 'redux-persist/lib/storage'
import type { ProviderId, AiFunctionGroup } from '@src/lib/providers'
import quizHistoryReducer from '@src/store/quizHistorySlice'

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
export interface ChapterDataState {
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

export interface ReadingPosition {
  chapter: number
  section: number
}

export interface ReadingProgressState {
  positions: Record<string, ReadingPosition>
  furthest: Record<string, number>
}

/** Normalize legacy number positions to { chapter, section } */
function migratePosition(value: unknown): ReadingPosition {
  if (typeof value === 'number') return { chapter: value, section: 0 }
  if (value && typeof value === 'object' && 'chapter' in value) return value as ReadingPosition
  return { chapter: 0, section: 0 }
}

const readingProgressSlice = createSlice({
  name: 'readingProgress',
  initialState: { positions: {}, furthest: {} } as ReadingProgressState,
  reducers: {
    setPosition(state, action: PayloadAction<{ bookId: string; chapter: number; section: number }>) {
      const { bookId, chapter, section } = action.payload
      state.positions[bookId] = { chapter, section }
      const prev = state.furthest[bookId] ?? -1
      if (chapter > prev) {
        state.furthest[bookId] = chapter
      }
    },
  },
})

export const { setPosition } = readingProgressSlice.actions

/** @deprecated Use setPosition instead */
export function setChapterPosition(payload: { bookId: string; chapterIndex: number }) {
  return setPosition({ bookId: payload.bookId, chapter: payload.chapterIndex, section: 0 })
}

export { migratePosition }

export interface ProviderConfig {
  apiKey: string | null
  model: string
}

export interface FunctionModelOverride {
  provider: ProviderId
  model: string
}

export interface SettingsState {
  // Legacy fields (ignored after migration)
  apiKey?: string | null
  model?: string
  // Multi-provider
  activeProvider: ProviderId
  providers: Record<ProviderId, ProviderConfig>
  functionModels: Partial<Record<AiFunctionGroup, FunctionModelOverride>>
  modelAssignmentSeen: boolean
  fontSize: number
  readingWidth: number
  quizLength: number
  defaultChapterCount: number
  textureEnabled: boolean
  textureOpacity: number
  libraryTab: 'all' | 'in-progress' | 'not-started' | 'finished'
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
    functionModels: {},
    modelAssignmentSeen: false,
    fontSize: 16,
    readingWidth: 768,
    quizLength: 3,
    defaultChapterCount: 12,
    textureEnabled: true,
    textureOpacity: 1,
    libraryTab: 'all' as const,
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
    setTextureEnabled(state, action: PayloadAction<boolean>) {
      state.textureEnabled = action.payload
    },
    setTextureOpacity(state, action: PayloadAction<number>) {
      state.textureOpacity = action.payload
    },
    setLibraryTab(state, action: PayloadAction<SettingsState['libraryTab']>) {
      state.libraryTab = action.payload
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
  setTextureEnabled,
  setTextureOpacity,
  setLibraryTab,
  setFunctionModel,
  clearFunctionModel,
  setModelAssignmentSeen,
} = settingsSlice.actions

// Derived selectors — return active provider's key/model
export const selectApiKey = (state: RootState) => state.settings.providers[state.settings.activeProvider]?.apiKey ?? null
export const selectHasApiKey = (state: RootState) => !!state.settings.providers[state.settings.activeProvider]?.apiKey
export const selectModel = (state: RootState) => state.settings.providers[state.settings.activeProvider]?.model ?? ''
export const selectActiveProvider = (state: RootState) => state.settings.activeProvider
export const selectProviders = (state: RootState) => state.settings.providers
export const selectFontSize = (state: RootState) => state.settings.fontSize
export const selectReadingWidth = (state: RootState) => state.settings.readingWidth
export const selectQuizLength = (state: RootState) => state.settings.quizLength ?? 3
export const selectDefaultChapterCount = (state: RootState) => state.settings.defaultChapterCount ?? 12
export const selectTextureEnabled = (state: RootState) => state.settings.textureEnabled
export const selectTextureOpacity = (state: RootState) => state.settings.textureOpacity
export const selectLibraryTab = (state: RootState) => state.settings.libraryTab
export const selectModelAssignmentSeen = (state: RootState) => state.settings.modelAssignmentSeen
export const selectFunctionModel = (group: AiFunctionGroup) => (state: RootState): { provider: ProviderId; model: string } => {
  const override = state.settings.functionModels?.[group]
  if (override) return override
  const p = state.settings.activeProvider
  return { provider: p, model: state.settings.providers[p]?.model ?? '' }
}

// --- Background Tasks ---

export interface ClientTask {
  id: string
  type: string
  bookId: string
  bookTitle: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  progress: { current: number; total: number; label: string }
  error?: string
  result?: unknown
}

export interface BackgroundTasksState {
  tasks: Record<string, ClientTask>
}

const backgroundTasksSlice = createSlice({
  name: 'backgroundTasks',
  initialState: { tasks: {} } as BackgroundTasksState,
  reducers: {
    taskCreated(state, action: PayloadAction<ClientTask>) {
      state.tasks[action.payload.id] = action.payload
    },
    taskProgressUpdated(state, action: PayloadAction<{ taskId: string; progress: ClientTask['progress'] }>) {
      const task = state.tasks[action.payload.taskId]
      if (task) task.progress = action.payload.progress
    },
    taskCompleted(state, action: PayloadAction<{ taskId: string; result?: unknown }>) {
      const task = state.tasks[action.payload.taskId]
      if (task) {
        task.status = 'done'
        task.result = action.payload.result
        task.progress = { ...task.progress, current: task.progress.total, label: 'Complete' }
      }
    },
    taskFailed(state, action: PayloadAction<{ taskId: string; error: string }>) {
      const task = state.tasks[action.payload.taskId]
      if (task) {
        task.status = 'error'
        task.error = action.payload.error
      }
    },
    taskCancelled(state, action: PayloadAction<{ taskId: string }>) {
      const task = state.tasks[action.payload.taskId]
      if (task) task.status = 'cancelled'
    },
    taskRemoved(state, action: PayloadAction<{ taskId: string }>) {
      delete state.tasks[action.payload.taskId]
    },
  },
})

export const {
  taskCreated,
  taskProgressUpdated,
  taskCompleted,
  taskFailed,
  taskCancelled,
  taskRemoved,
} = backgroundTasksSlice.actions

export const selectBackgroundTasks = (state: RootState) => state.backgroundTasks.tasks
export const selectRunningTasks = (state: RootState) =>
  Object.values(state.backgroundTasks.tasks).filter(t => t.status === 'running')

const rootReducer = combineReducers({
  readingProgress: readingProgressSlice.reducer,
  settings: settingsSlice.reducer,
  chapterData: chapterDataSlice.reducer,
  quizHistory: quizHistoryReducer,
  backgroundTasks: backgroundTasksSlice.reducer,
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
    functionModels: inbound.functionModels ?? {},
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
        functionModels: {},
        apiKey: undefined,
        model: undefined,
      }
    }
    return { ...outbound, functionModels: outbound.functionModels ?? {} }
  },
  { whitelist: ['settings'] },
)

// Migrate legacy numeric positions to { chapter, section } on rehydrate
const migratePositionsTransform = createTransform(
  (inbound: ReadingProgressState) => inbound,
  (outbound: ReadingProgressState) => {
    if (!outbound?.positions) return outbound
    const migrated = { ...outbound, positions: { ...outbound.positions } }
    for (const [bookId, val] of Object.entries(migrated.positions)) {
      migrated.positions[bookId] = migratePosition(val)
    }
    return migrated
  },
  { whitelist: ['readingProgress'] },
)

const persistConfig = {
  key: 'tutor',
  storage: electronStorage,
  blacklist: ['backgroundTasks'],
  transforms: [stripApiKeysTransform, migratePositionsTransform],
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

export { recordQuizAttempt } from '@src/store/quizHistorySlice'
export type { QuizQuestion as QuizHistoryQuestion, QuizAttempt, ChapterQuiz } from '@src/store/quizHistorySlice'

export {
  selectChapterQuiz,
  selectChapterAttempts,
  selectOverallScore,
  selectChaptersNeedingReview,
  selectChapterSparkline,
  selectSmartReviewQueue,
  selectBookQuizSummary,
  selectPerQuestionCorrectRate,
} from '@src/store/quizHistorySelectors'
