import { describe, it, expect } from 'vitest'
import { createFakeKeyVault } from '../ports/key-vault.fake.js'
import { listProviderModels } from './list-provider-models.js'

describe('listProviderModels', () => {
  it('fails with the exact message the client has always seen when no key is configured', async () => {
    const result = await listProviderModels({ keyVault: createFakeKeyVault() }, 'anthropic', AbortSignal.timeout(1000))

    expect(result).toEqual({ ok: false, status: 400, error: 'No API key configured for anthropic' })
  })

  it('rejects a provider outside the known set without ever calling fetch', async () => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      throw new Error('should never be called')
    }) as unknown as typeof fetch

    const result = await listProviderModels(
      { keyVault: createFakeKeyVault({ anthropic: 'sk-test' }), fetchImpl },
      'bogus-provider',
      AbortSignal.timeout(1000),
    )

    expect(result).toEqual({ ok: false, status: 400, error: 'Invalid provider' })
    expect(called).toBe(false)
  })

  it('fetches openai models through the injected fetch and filters/labels them, never touching the real network', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      data: [
        { id: 'gpt-4o' },
        { id: 'gpt-4o-2024-08-06' }, // dated snapshot, dropped
        { id: 'whisper-1' }, // excluded token
        { id: 'dall-e-3' }, // image, not chat
        { id: 'gpt-image-1' }, // image, not chat
      ],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await listProviderModels(
      { keyVault: createFakeKeyVault({ openai: 'sk-test' }), fetchImpl },
      'openai',
      AbortSignal.timeout(1000),
    )

    expect(result).toEqual({
      ok: true,
      models: {
        chat: [{ value: 'gpt-4o', label: 'gpt-4o' }],
        image: [
          { value: 'dall-e-3', label: 'DALL-E 3 (legacy)' },
          { value: 'gpt-image-1', label: 'GPT Image 1' },
        ],
      },
    })
  })

  it('surfaces a 502 with the upstream failure message when the provider request fails', async () => {
    const fetchImpl = (async () => new Response('', { status: 500 })) as unknown as typeof fetch

    const result = await listProviderModels(
      { keyVault: createFakeKeyVault({ anthropic: 'sk-test' }), fetchImpl },
      'anthropic',
      AbortSignal.timeout(1000),
    )

    expect(result).toEqual({ ok: false, status: 502, error: 'Anthropic /v1/models returned 500' })
  })
})
