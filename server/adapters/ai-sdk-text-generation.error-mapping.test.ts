import { describe, expect, it } from 'vitest'
import { APICallError, LoadAPIKeyError, NoObjectGeneratedError } from 'ai'
import { TextGenerationError } from '../ports/text-generation.js'
import { mapProviderError } from './ai-sdk-text-generation.js'

/**
 * Unit tests for mapProviderError against synthesized errors, never a real
 * network call. APICallError, LoadAPIKeyError, and NoObjectGeneratedError
 * are constructed for real, through their actual constructors from the
 * installed `ai` package, rather than as hand-shaped plain objects, so
 * these tests also catch a future `ai` upgrade that changes what those
 * constructors require.
 */

const NOT_CANCELLED = { timeoutFired: false, callerAborted: false }

function apiCallError(opts: {
  statusCode?: number
  responseHeaders?: Record<string, string>
  message?: string
}): APICallError {
  return new APICallError({
    message: opts.message ?? 'API call failed',
    url: 'https://example.test/v1/messages',
    requestBodyValues: {},
    statusCode: opts.statusCode,
    responseHeaders: opts.responseHeaders,
  })
}

function noObjectGeneratedError(finishReason: 'content-filter' | 'error' | 'other'): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    message: 'No object generated',
    response: { id: 'resp-1', timestamp: new Date(), modelId: 'claude-test' },
    usage: {
      inputTokens: 1,
      inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokens: 1,
      outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
      totalTokens: 2,
    },
    finishReason,
  })
}

describe('mapProviderError, authentication', () => {
  it('maps LoadAPIKeyError to auth-failed, not retryable', () => {
    const err = new LoadAPIKeyError({ message: 'OpenAI API key is missing' })

    const mapped = mapProviderError(err, NOT_CANCELLED)

    expect(mapped).toBeInstanceOf(TextGenerationError)
    expect((mapped as TextGenerationError).kind).toBe('auth-failed')
    expect((mapped as TextGenerationError).retryable).toBe(false)
  })

  it('maps a plain Error whose message names a missing configured key to auth-failed', () => {
    const err = new Error('No API key configured for provider: anthropic')

    const mapped = mapProviderError(err, NOT_CANCELLED)

    expect(mapped).toBeInstanceOf(TextGenerationError)
    expect((mapped as TextGenerationError).kind).toBe('auth-failed')
  })

  it('maps a 401 APICallError to auth-failed', () => {
    const mapped = mapProviderError(apiCallError({ statusCode: 401 }), NOT_CANCELLED)

    expect((mapped as TextGenerationError).kind).toBe('auth-failed')
  })

  it('maps a 403 APICallError to auth-failed', () => {
    const mapped = mapProviderError(apiCallError({ statusCode: 403 }), NOT_CANCELLED)

    expect((mapped as TextGenerationError).kind).toBe('auth-failed')
  })

  it('passes an already-mapped TextGenerationError through unchanged rather than re-wrapping it', () => {
    const original = new TextGenerationError('auth-failed', 'No API key configured for provider: anthropic')

    const mapped = mapProviderError(original, NOT_CANCELLED)

    expect(mapped).toBe(original)
  })
})

describe('mapProviderError, rate limiting', () => {
  it('maps a 429 to rate-limited and retryable', () => {
    const mapped = mapProviderError(apiCallError({ statusCode: 429 }), NOT_CANCELLED)

    expect((mapped as TextGenerationError).kind).toBe('rate-limited')
    expect((mapped as TextGenerationError).retryable).toBe(true)
  })

  it('reads retry-after in seconds form as milliseconds', () => {
    const mapped = mapProviderError(
      apiCallError({ statusCode: 429, responseHeaders: { 'retry-after': '2' } }),
      NOT_CANCELLED,
    )

    expect((mapped as TextGenerationError).retryAfterMs).toBe(2000)
  })

  it('reads retry-after in HTTP-date form as milliseconds until that date', () => {
    const target = new Date(Date.now() + 2000)
    const mapped = mapProviderError(
      apiCallError({ statusCode: 429, responseHeaders: { 'retry-after': target.toUTCString() } }),
      NOT_CANCELLED,
    )

    const retryAfterMs = (mapped as TextGenerationError).retryAfterMs
    expect(retryAfterMs).toBeGreaterThan(1000)
    expect(retryAfterMs).toBeLessThan(3000)
  })

  it('leaves retryAfterMs undefined when the header is absent', () => {
    const mapped = mapProviderError(apiCallError({ statusCode: 429 }), NOT_CANCELLED)

    expect((mapped as TextGenerationError).retryAfterMs).toBeUndefined()
  })
})

describe('mapProviderError, provider overload and timeout status codes', () => {
  it.each([500, 502, 503, 529])('maps statusCode %i to overloaded, retryable', (statusCode) => {
    const mapped = mapProviderError(apiCallError({ statusCode }), NOT_CANCELLED)

    expect((mapped as TextGenerationError).kind).toBe('overloaded')
    expect((mapped as TextGenerationError).retryable).toBe(true)
  })

  it.each([408, 504])('maps statusCode %i to timed-out, retryable', (statusCode) => {
    const mapped = mapProviderError(apiCallError({ statusCode }), NOT_CANCELLED)

    expect((mapped as TextGenerationError).kind).toBe('timed-out')
    expect((mapped as TextGenerationError).retryable).toBe(true)
  })
})

describe('mapProviderError, network failures', () => {
  it('maps a bare TypeError: fetch failed to network-failed', () => {
    const mapped = mapProviderError(new TypeError('fetch failed'), NOT_CANCELLED)

    expect((mapped as TextGenerationError).kind).toBe('network-failed')
  })

  it.each(['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'])(
    'maps an Error whose cause.code is %s to network-failed',
    (code) => {
      const err = new Error('fetch failed', { cause: { code } })

      const mapped = mapProviderError(err, NOT_CANCELLED)

      expect((mapped as TextGenerationError).kind).toBe('network-failed')
    },
  )
})

describe('mapProviderError, content refusal', () => {
  it('maps NoObjectGeneratedError with finishReason content-filter to content-refused', () => {
    const mapped = mapProviderError(noObjectGeneratedError('content-filter'), NOT_CANCELLED)

    expect((mapped as TextGenerationError).kind).toBe('content-refused')
  })

  it('maps NoObjectGeneratedError with any other finishReason to unknown', () => {
    const mapped = mapProviderError(noObjectGeneratedError('error'), NOT_CANCELLED)

    expect((mapped as TextGenerationError).kind).toBe('unknown')
  })

  it('maps an error carrying an Anthropic-style stop_reason of refusal to content-refused', () => {
    const err = Object.assign(new Error('The model refused to respond'), { stop_reason: 'refusal' })

    const mapped = mapProviderError(err, NOT_CANCELLED)

    expect((mapped as TextGenerationError).kind).toBe('content-refused')
  })
})

describe('mapProviderError, fallback', () => {
  it('maps a bare Error to unknown, not retryable, preserving its message as reason', () => {
    const mapped = mapProviderError(new Error('boom'), NOT_CANCELLED)

    expect((mapped as TextGenerationError).kind).toBe('unknown')
    expect((mapped as TextGenerationError).retryable).toBe(false)
    expect((mapped as TextGenerationError).reason).toBe('boom')
  })
})

describe('mapProviderError, cancellation', () => {
  it('maps to timed-out when the timeout signal fired', () => {
    const err = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })

    const mapped = mapProviderError(err, { timeoutFired: true, callerAborted: false })

    expect((mapped as TextGenerationError).kind).toBe('timed-out')
  })

  it('returns the original error unchanged, by identity, when the caller aborted', () => {
    const err = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })

    const mapped = mapProviderError(err, { timeoutFired: false, callerAborted: true })

    expect(mapped).toBe(err)
  })

  it('prefers timed-out when both the timeout and the caller signal fired', () => {
    const err = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })

    const mapped = mapProviderError(err, { timeoutFired: true, callerAborted: true })

    expect((mapped as TextGenerationError).kind).toBe('timed-out')
  })
})
