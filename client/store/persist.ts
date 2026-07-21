/**
 * How state survives a restart.
 *
 * Two responsibilities live here. Choosing where bytes go, which is Electron
 * IPC when the app is packaged and localStorage otherwise. And the transforms,
 * which strip secrets on the way out and migrate old shapes on the way back.
 *
 * The order of the transforms array is load bearing. Redux persist folds it
 * left to right on the way to storage and right to left on the way back, so
 * the last entry is the first to see stored data.
 */
import { createTransform } from 'redux-persist'
import storage from 'redux-persist/lib/storage'
import type { ProviderId } from '@client/lib/providers'
import { migratePosition, type ReadingProgressState } from './readingProgress'
import {
  DEFAULT_LIBRARY_FILTERS,
  DEFAULT_READING_WIDTH,
  READING_WIDTHS,
  type SettingsState,
} from './settings'

// Use Electron IPC storage when available, otherwise fall back to localStorage
const electronStorage = typeof window !== 'undefined' && window.electronAPI?.storageGet
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
          anthropic: { apiKey: null, model: outbound.model || 'claude-sonnet-4-6' },
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

// Auto-upgrade outdated model IDs on rehydrate so users following the default
// move forward when a new model ships. To bump a model, add the old -> new
// entry here; users with that exact stored model get migrated next launch.
// Users who explicitly picked a model that isn't a key in this map are left
// alone — they made a deliberate choice.
const MODEL_ID_MIGRATIONS: Record<string, string> = {
  // May 2025 → Nov 2025 family
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
  'claude-opus-4-20250514': 'claude-opus-4-7',
}

const migrateModelIdsTransform = createTransform(
  (inbound: SettingsState) => inbound,
  (outbound: SettingsState) => {
    if (!outbound?.providers) return outbound
    let changed = false
    const providers = { ...outbound.providers }
    for (const [pid, pcfg] of Object.entries(providers) as [ProviderId, { apiKey: string | null; model: string }][]) {
      const next = MODEL_ID_MIGRATIONS[pcfg.model]
      if (next) {
        providers[pid] = { ...pcfg, model: next }
        changed = true
      }
    }
    const fnModels: Record<string, { provider: ProviderId; model: string }> = { ...(outbound.functionModels ?? {}) }
    for (const [group, override] of Object.entries(fnModels)) {
      const next = MODEL_ID_MIGRATIONS[override.model]
      if (next) {
        fnModels[group] = { ...override, model: next }
        changed = true
      }
    }
    return changed ? { ...outbound, providers, functionModels: fnModels } : outbound
  },
  { whitelist: ['settings'] },
)

// Migrate legacy libraryTab to libraryFilters on rehydrate
const migrateLibraryTabTransform = createTransform(
  (inbound: SettingsState) => inbound,
  (outbound: SettingsState) => {
    // If persisted state has libraryTab but no libraryFilters, migrate
    if (outbound.libraryTab && !outbound.libraryFilters) {
      const migrated = { ...outbound }
      migrated.libraryFilters = {
        ...DEFAULT_LIBRARY_FILTERS,
        status: outbound.libraryTab,
      }
      migrated.librarySort = migrated.librarySort ?? { field: 'date', direction: 'desc' }
      migrated.libraryView = migrated.libraryView ?? 'grid'
      delete migrated.libraryTab
      return migrated
    }
    // Ensure defaults exist even if partially missing
    return {
      ...outbound,
      librarySort: outbound.librarySort ?? { field: 'date', direction: 'desc' },
      libraryView: outbound.libraryView ?? 'grid',
      libraryFilters: outbound.libraryFilters ?? { ...DEFAULT_LIBRARY_FILTERS },
      readingWidth: READING_WIDTHS.includes(outbound.readingWidth as typeof READING_WIDTHS[number])
        ? outbound.readingWidth
        : DEFAULT_READING_WIDTH,
    }
  },
  { whitelist: ['settings'] },
)

export const persistConfig = {
  key: 'tutor',
  storage: electronStorage,
  blacklist: ['backgroundTasks'],
  transforms: [stripApiKeysTransform, migrateModelIdsTransform, migratePositionsTransform, migrateLibraryTabTransform],
}
