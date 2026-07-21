import { describe, it, expect } from 'vitest'
import { persistConfig } from './persist'
import { DEFAULT_LIBRARY_FILTERS, type SettingsState } from './settings'
import type { ReadingProgressState } from './readingProgress'

/**
 * The persistence contract, pinned.
 *
 * This is the one part of the client where a refactoring mistake destroys user
 * data rather than showing a wrong pixel. Renaming a reducer key, reordering
 * the transforms, or dropping one of them silently discards reading positions,
 * model choices and library filters that people accumulated over months, and
 * nothing fails loudly when it happens.
 *
 * The helpers below reproduce exactly how redux-persist applies transforms.
 * On the way to storage it folds them left to right. On the way back it folds
 * them right to left, so the last transform in the list is the first to see
 * stored data. That reversal is easy to lose in a refactor and impossible to
 * notice without a test, because both orders look equally plausible in source.
 */

type Transform = { in: (s: unknown, k: string, full: unknown) => unknown; out: (s: unknown, k: string, full: unknown) => unknown }

function towardsStorage<T>(key: string, subState: T, fullState: Record<string, unknown> = {}): T {
  return (persistConfig.transforms as Transform[])
    .reduce<unknown>((state, transform) => transform.in(state, key, fullState), subState) as T
}

function fromStorage<T>(key: string, subState: unknown, fullState: Record<string, unknown> = {}): T {
  return (persistConfig.transforms as Transform[])
    .reduceRight<unknown>((state, transform) => transform.out(state, key, fullState), subState) as T
}

const settingsState = (overrides: Partial<SettingsState> = {}): SettingsState => ({
  activeProvider: 'anthropic',
  providers: {
    anthropic: { apiKey: 'configured', model: 'claude-sonnet-4-6' },
    openai: { apiKey: 'configured', model: 'gpt-4o' },
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
  librarySort: { field: 'date', direction: 'desc' },
  libraryView: 'grid',
  libraryFilters: { ...DEFAULT_LIBRARY_FILTERS },
  lastViewedBookId: null,
  ...overrides,
})

describe('persistConfig', () => {
  it('keeps the storage key every existing install already wrote under', () => {
    // Changing this orphans every user's saved state at the old key.
    expect(persistConfig.key).toBe('tutor')
  })

  it('excludes background tasks and nothing else', () => {
    // Tasks belong to a server process that has since restarted, so restoring
    // them would show progress bars for work that is no longer running.
    expect(persistConfig.blacklist).toEqual(['backgroundTasks'])
  })

  it('runs exactly four transforms', () => {
    expect(persistConfig.transforms).toHaveLength(4)
  })
})

describe('on the way to storage', () => {
  it('never writes an API key', () => {
    // Keys live in the OS keychain by way of safeStorage. A copy in plain
    // JSON would defeat that entirely.
    const stored = towardsStorage('settings', settingsState())

    expect(stored.providers.anthropic.apiKey).toBeNull()
    expect(stored.providers.openai.apiKey).toBeNull()
    expect(stored.providers.google.apiKey).toBeNull()
    expect(JSON.stringify(stored)).not.toContain('configured')
  })

  it('keeps the model choice for every provider', () => {
    const stored = towardsStorage('settings', settingsState())

    expect(stored.providers.anthropic.model).toBe('claude-sonnet-4-6')
    expect(stored.providers.openai.model).toBe('gpt-4o')
    expect(stored.providers.google.model).toBe('gemini-2.0-flash')
  })

  it('drops the legacy top-level key and model fields', () => {
    const stored = towardsStorage('settings', settingsState({ apiKey: 'sk-legacy', model: 'claude-2' }))

    expect(JSON.parse(JSON.stringify(stored))).not.toHaveProperty('apiKey')
    expect(JSON.parse(JSON.stringify(stored))).not.toHaveProperty('model')
  })

  it('leaves reading progress untouched', () => {
    const progress: ReadingProgressState = {
      positions: { ada: { chapter: 3, section: 1, lastReadAt: '2026-01-01T00:00:00.000Z' } },
      furthest: { ada: 3 },
    }

    expect(towardsStorage('readingProgress', progress)).toEqual(progress)
  })
})

describe('on the way back from storage', () => {
  it('upgrades a model id that has been superseded', () => {
    const restored = fromStorage<SettingsState>('settings', settingsState({
      providers: {
        anthropic: { apiKey: null, model: 'claude-sonnet-4-20250514' },
        openai: { apiKey: null, model: 'gpt-4o' },
        google: { apiKey: null, model: 'gemini-2.0-flash' },
      },
    }))

    expect(restored.providers.anthropic.model).toBe('claude-sonnet-4-6')
  })

  it('upgrades a superseded model id inside a per-function override', () => {
    const restored = fromStorage<SettingsState>('settings', settingsState({
      functionModels: { generation: { provider: 'anthropic', model: 'claude-opus-4-20250514' } },
    }))

    expect(restored.functionModels.generation).toEqual({ provider: 'anthropic', model: 'claude-opus-4-7' })
  })

  it('leaves a model the user chose deliberately alone', () => {
    const restored = fromStorage<SettingsState>('settings', settingsState({
      providers: {
        anthropic: { apiKey: null, model: 'claude-haiku-4-5' },
        openai: { apiKey: null, model: 'gpt-4o' },
        google: { apiKey: null, model: 'gemini-2.0-flash' },
      },
    }))

    expect(restored.providers.anthropic.model).toBe('claude-haiku-4-5')
  })

  it('turns a legacy numeric reading position into a full position', () => {
    const restored = fromStorage<ReadingProgressState>('readingProgress', {
      positions: { ada: 4 },
      furthest: { ada: 4 },
    })

    expect(restored.positions.ada.chapter).toBe(4)
    expect(restored.positions.ada.section).toBe(0)
    expect(typeof restored.positions.ada.lastReadAt).toBe('string')
  })

  it('turns a legacy library tab into the filter that replaced it', () => {
    const restored = fromStorage<SettingsState>('settings', {
      ...settingsState(),
      libraryTab: 'in-progress',
      libraryFilters: undefined,
    })

    expect(restored.libraryFilters).toEqual({ ...DEFAULT_LIBRARY_FILTERS, status: 'in-progress' })
    expect(restored).not.toHaveProperty('libraryTab')
  })

  it('fills in library defaults that predate those settings', () => {
    const restored = fromStorage<SettingsState>('settings', {
      ...settingsState(),
      librarySort: undefined,
      libraryView: undefined,
      libraryFilters: undefined,
    })

    expect(restored.librarySort).toEqual({ field: 'date', direction: 'desc' })
    expect(restored.libraryView).toBe('grid')
    expect(restored.libraryFilters).toEqual(DEFAULT_LIBRARY_FILTERS)
  })

  it('replaces a reading width that is no longer offered', () => {
    const restored = fromStorage<SettingsState>('settings', settingsState({ readingWidth: 1234 }))

    expect(restored.readingWidth).toBe(768)
  })

  it('migrates a pre-multi-provider install to the provider map', () => {
    // The legacy shape had one key and one model at the top level. This runs
    // last on the way back, after the library migration has already touched
    // the same object, and both have to survive.
    const restored = fromStorage<SettingsState>('settings', {
      apiKey: 'sk-legacy',
      model: 'claude-3-opus',
      libraryTab: 'finished',
    })

    expect(restored.activeProvider).toBe('anthropic')
    expect(restored.providers.anthropic).toEqual({ apiKey: null, model: 'claude-3-opus' })
    expect(restored.providers.openai.model).toBe('gpt-4o')
    expect(restored.libraryFilters).toEqual({ ...DEFAULT_LIBRARY_FILTERS, status: 'finished' })
  })

  it('restores a current settings object unchanged', () => {
    const current = settingsState({
      providers: {
        anthropic: { apiKey: null, model: 'claude-sonnet-4-6' },
        openai: { apiKey: null, model: 'gpt-4o' },
        google: { apiKey: null, model: 'gemini-2.0-flash' },
      },
    })

    expect(fromStorage<SettingsState>('settings', current)).toEqual(current)
  })
})
