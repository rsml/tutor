import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { saveApiKey, removeApiKey, getApiKeyStatus, checkHealth, getProviderModels } from './settings'

/**
 * Each of these wraps a single fetch through the shared request or apiFetch
 * helper, so these tests check the method, the resolved URL and the body
 * that gets built, leaving the transport itself to http.test.ts.
 */

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
  vi.restoreAllMocks()
})

describe('saveApiKey', () => {
  it('posts the provider and the key to /api/settings/api-key', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await saveApiKey('anthropic', 'sk-ant-test')

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/settings/api-key')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ provider: 'anthropic', apiKey: 'sk-ant-test' })
  })
})

describe('removeApiKey', () => {
  it('sends a DELETE to /api/settings/api-key with the provider in the body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await removeApiKey('openai')

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/settings/api-key')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('DELETE')
    // The body is what makes this DELETE unusual, so its presence gets its
    // own explicit assertion rather than an assumption.
    expect(JSON.parse(init.body as string)).toEqual({ provider: 'openai' })
  })
})

describe('getApiKeyStatus', () => {
  it('gets the configured status for every provider', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('{"anthropic":true,"openai":false,"google":false}', { status: 200 }),
    )

    const status = await getApiKeyStatus()

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/settings/api-key-status')
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('GET')
    expect(status).toEqual({ anthropic: true, openai: false, google: false })
  })
})

describe('checkHealth', () => {
  it('resolves true on a 200 from GET /api/health', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))

    await expect(checkHealth()).resolves.toBe(true)

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/health')
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('GET')
  })

  it('resolves false on a non-2xx response rather than throwing', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }))

    await expect(checkHealth()).resolves.toBe(false)
  })

  it('resolves false rather than throwing when fetch itself rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(checkHealth()).resolves.toBe(false)
  })

  it('omits the trace header, since the ten second poll would otherwise be preflighted', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))

    await checkHealth()

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).has('X-Trace-Id')).toBe(false)
  })
})

describe('getProviderModels', () => {
  it('gets the chat and image models for a provider', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      '{"chat":[{"value":"claude-sonnet-4-6","label":"Claude Sonnet 4.6"}],"image":[]}',
      { status: 200 },
    ))

    const models = await getProviderModels('anthropic')

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/providers/anthropic/models')
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('GET')
    expect(models).toEqual({ chat: [{ value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' }], image: [] })
  })
})
