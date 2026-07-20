import { describe, it, expect } from 'vitest'
import {
  ProviderSchema,
  PROVIDERS,
  MODEL_REGEX,
  DEFAULT_PROVIDER,
  isProviderId,
} from './provider.js'

/**
 * The safety net for the provider module now that 'anthropic', 'openai', and
 * 'google' exist in exactly one place. PROVIDERS and DEFAULT_PROVIDER both
 * derive from ProviderSchema, so a change to the enum that silently reorders
 * or drops a provider fails here first instead of surfacing as a mismatched
 * dropdown or a rejected request somewhere downstream.
 */

describe('ProviderSchema', () => {
  it('accepts exactly anthropic, openai, and google, in that order', () => {
    expect(ProviderSchema.options).toEqual([
      'anthropic',
      'openai',
      'google',
    ])
  })

  it('rejects an unknown provider string', () => {
    expect(ProviderSchema.safeParse('cohere').success).toBe(false)
  })
})

describe('PROVIDERS', () => {
  it('matches ProviderSchema.options', () => {
    expect(PROVIDERS).toEqual(ProviderSchema.options)
  })

  it('lists anthropic, openai, and google, in that order', () => {
    expect(PROVIDERS).toEqual([
      'anthropic',
      'openai',
      'google',
    ])
  })
})

describe('MODEL_REGEX', () => {
  it('accepts a realistic Anthropic model id', () => {
    expect(MODEL_REGEX.test('claude-sonnet-4-20250514')).toBe(true)
  })

  it('accepts a realistic OpenAI model id', () => {
    expect(MODEL_REGEX.test('gpt-4o')).toBe(true)
  })

  it('rejects a model id containing a space', () => {
    expect(MODEL_REGEX.test('gpt 4o')).toBe(false)
  })

  it('rejects a model id over 100 characters', () => {
    expect(MODEL_REGEX.test('a'.repeat(101))).toBe(false)
  })
})

describe('DEFAULT_PROVIDER', () => {
  it('is anthropic', () => {
    expect(DEFAULT_PROVIDER).toBe('anthropic')
  })

  it('is a valid provider id', () => {
    expect(isProviderId(DEFAULT_PROVIDER)).toBe(true)
  })
})

describe('isProviderId', () => {
  for (const provider of PROVIDERS) {
    it(`accepts ${provider}`, () => {
      expect(isProviderId(provider)).toBe(true)
    })
  }

  it('rejects an unknown provider string', () => {
    expect(isProviderId('cohere')).toBe(false)
  })
})
