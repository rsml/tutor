import { describe, expect, it } from 'vitest'
import type { LanguageModel } from 'ai'
import { AI_GENERATION_TIMEOUT_MS } from '../constants.js'
import { createFakeKeyVault } from '../ports/key-vault.fake.js'
import { composeAbortSignal, resolveModelClient } from './ai-sdk-text-generation.js'

// resolveModelClient's return type, LanguageModel, is a union that also
// allows a bare model-id string, for a registry-style global provider. The
// real implementation never returns that variant. It always calls one of
// the three provider factories and returns the resulting model object.
// This narrows that union back down so tests can read `.modelId` off it.
function modelIdOf(model: LanguageModel): string {
  if (typeof model === 'string') {
    throw new Error('expected a resolved model object, got a bare model id string')
  }
  return model.modelId
}

/**
 * The TextGeneration contract (server/ports/text-generation.contract.ts) is
 * fake-only and is never run against this adapter here. Doing so would
 * spend real money against a live provider and reach the network. These
 * tests instead cover the two parts of the adapter that are hermetically
 * testable without a network call or an API key. Those are provider and
 * model resolution, and the timeout signal composition. Constructing a
 * model client below never phones home. Every AI SDK provider factory is
 * lazy, only making a request once the returned model is actually used to
 * generate or stream something, which none of these tests do.
 */

describe('resolveModelClient', () => {
  it('throws for a provider the app does not know about', () => {
    const keyVault = createFakeKeyVault({ anthropic: 'sk-test' })

    expect(() => resolveModelClient(keyVault, 'not-a-real-provider', 'claude-sonnet-4-6'))
      .toThrow('Invalid provider: not-a-real-provider')
  })

  it('throws for a model identifier with characters outside MODEL_REGEX', () => {
    const keyVault = createFakeKeyVault({ anthropic: 'sk-test' })

    expect(() => resolveModelClient(keyVault, 'anthropic', 'not a valid model!'))
      .toThrow('Invalid model identifier: not a valid model!')
  })

  it('throws when the vault has no key for the requested provider', () => {
    const keyVault = createFakeKeyVault()

    expect(() => resolveModelClient(keyVault, 'anthropic', 'claude-sonnet-4-6'))
      .toThrow('No API key configured for provider: anthropic')
  })

  it('resolves an anthropic model client once a key is present', () => {
    const keyVault = createFakeKeyVault({ anthropic: 'sk-test-dummy' })

    const model = resolveModelClient(keyVault, 'anthropic', 'claude-sonnet-4-6')

    expect(model).toBeTruthy()
    expect(modelIdOf(model)).toBe('claude-sonnet-4-6')
  })

  it('resolves an openai model client once a key is present', () => {
    const keyVault = createFakeKeyVault({ openai: 'sk-test-dummy' })

    const model = resolveModelClient(keyVault, 'openai', 'gpt-4o')

    expect(model).toBeTruthy()
    expect(modelIdOf(model)).toBe('gpt-4o')
  })

  it('resolves a google model client once a key is present', () => {
    const keyVault = createFakeKeyVault({ google: 'test-dummy-key' })

    const model = resolveModelClient(keyVault, 'google', 'gemini-2.0-flash')

    expect(model).toBeTruthy()
    expect(modelIdOf(model)).toBe('gemini-2.0-flash')
  })
})

describe('composeAbortSignal', () => {
  it('is not aborted when neither the caller signal nor the timeout has fired', () => {
    const combined = composeAbortSignal(undefined, AI_GENERATION_TIMEOUT_MS)

    expect(combined.aborted).toBe(false)
  })

  it('aborts the composed signal when the caller signal aborts', () => {
    const controller = new AbortController()
    const combined = composeAbortSignal(controller.signal, AI_GENERATION_TIMEOUT_MS)

    expect(combined.aborted).toBe(false)
    controller.abort()
    expect(combined.aborted).toBe(true)
  })

  // AbortSignal.timeout()'s countdown runs on the runtime's own native
  // timer, not the global setTimeout that vi.useFakeTimers() intercepts.
  // This was verified empirically, advancing fake timers by the full
  // timeout duration never fires a real AbortSignal.timeout(). So the
  // "internal timeout also aborts the composed signal" behaviour below is
  // exercised with a real, but tiny, timeout instead of a faked
  // five-minute one. The `timeoutMs` parameter exists for exactly this.
  // Production code never passes it, and always relies on the
  // AI_GENERATION_TIMEOUT_MS default.

  it('aborts the composed signal on its own once the internal timeout elapses', async () => {
    const combined = composeAbortSignal(undefined, 10)

    expect(combined.aborted).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(combined.aborted).toBe(true)
  })

  it('aborts on its own timeout even when a caller signal is provided and never fires', async () => {
    const controller = new AbortController()
    const combined = composeAbortSignal(controller.signal, 10)

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(combined.aborted).toBe(true)
  })
})
