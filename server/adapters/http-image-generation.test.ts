import { describe, expect, it, vi } from 'vitest'
import { createHttpImageGeneration } from './http-image-generation.js'
import { createFakeKeyVault } from '../ports/key-vault.fake.js'

/** Minimal Response double: only the members this adapter actually reads. */
function fakeResponse(status: number, body: unknown): Response {
  const text = JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    headers: { get: () => 'application/json' },
  } as unknown as Response
}

function b64Image(marker: string): string {
  return Buffer.from(`fake-image:${marker}`).toString('base64')
}

describe('createHttpImageGeneration', () => {
  it('throws when no API key is configured for the provider, without making a request', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const imageGen = createHttpImageGeneration({ keyVault: createFakeKeyVault(), fetch: fetchMock })

    await expect(imageGen.generate({
      provider: 'openai',
      preferredModel: 'gpt-image-1',
      prompt: 'a cover',
      signal: new AbortController().signal,
    })).rejects.toThrow('No API key configured for openai')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns an image for a valid request, produced by the preferred model', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      fakeResponse(200, { data: [{ b64_json: b64Image('gpt-image-1') }] }),
    )
    const imageGen = createHttpImageGeneration({
      keyVault: createFakeKeyVault({ openai: 'sk-test' }),
      fetch: fetchMock,
    })

    const image = await imageGen.generate({
      provider: 'openai',
      preferredModel: 'gpt-image-1',
      prompt: 'a minimal abstract book cover',
      signal: new AbortController().signal,
    })

    expect(image.data.toString()).toBe('fake-image:gpt-image-1')
    expect(image.mediaType).toBe('image/png')
    expect(image._diag).toEqual({ modelUsed: 'gpt-image-1', fellBack: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/images/generations')
  })

  it('falls back to the next model in the chain on a recoverable failure, and reports fellBack', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string }
      if (body.model === 'gpt-image-1') return fakeResponse(500, { error: { message: 'server error' } })
      if (body.model === 'dall-e-3') return fakeResponse(200, { data: [{ b64_json: b64Image('dall-e-3') }] })
      throw new Error(`unexpected model in test: ${body.model}`)
    })
    const imageGen = createHttpImageGeneration({
      keyVault: createFakeKeyVault({ openai: 'sk-test' }),
      fetch: fetchMock,
    })

    const image = await imageGen.generate({
      provider: 'openai',
      preferredModel: 'gpt-image-1',
      prompt: 'cover art',
      signal: new AbortController().signal,
    })

    expect(image._diag).toEqual({ modelUsed: 'dall-e-3', fellBack: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a fallback model on an auth failure, it rejects immediately', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      fakeResponse(401, { error: { message: 'invalid api key' } }),
    )
    const imageGen = createHttpImageGeneration({
      keyVault: createFakeKeyVault({ openai: 'sk-bad' }),
      fetch: fetchMock,
    })

    await expect(imageGen.generate({
      provider: 'openai',
      preferredModel: 'gpt-image-1',
      prompt: 'cover art',
      signal: new AbortController().signal,
    })).rejects.toThrow('Authentication failed for openai')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a fallback model on a content-policy failure, it rejects immediately', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      fakeResponse(400, {
        error: { message: 'Your request was rejected as a result of our safety system.', code: 'content_policy_violation' },
      }),
    )
    const imageGen = createHttpImageGeneration({
      keyVault: createFakeKeyVault({ openai: 'sk-test' }),
      fetch: fetchMock,
    })

    await expect(imageGen.generate({
      provider: 'openai',
      preferredModel: 'gpt-image-1',
      prompt: 'cover art',
      signal: new AbortController().signal,
    })).rejects.toThrow('Image rejected by content policy')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects when every model in the chain fails', async () => {
    // anthropic has no configured fallback chain, so failing the preferred
    // (and only unsupported-provider) model exhausts the whole chain in one
    // step, without ever calling fetch.
    const fetchMock = vi.fn<typeof fetch>()
    const imageGen = createHttpImageGeneration({
      keyVault: createFakeKeyVault({ anthropic: 'sk-test' }),
      fetch: fetchMock,
    })

    await expect(imageGen.generate({
      provider: 'anthropic',
      preferredModel: 'preferred-model',
      prompt: 'cover art',
      signal: new AbortController().signal,
    })).rejects.toThrow('All image models failed')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects when the signal is already aborted, without making a request', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const imageGen = createHttpImageGeneration({
      keyVault: createFakeKeyVault({ openai: 'sk-test' }),
      fetch: fetchMock,
    })
    const controller = new AbortController()
    controller.abort()

    await expect(imageGen.generate({
      provider: 'openai',
      preferredModel: 'gpt-image-1',
      prompt: 'cover art',
      signal: controller.signal,
    })).rejects.toThrow()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
