import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiError } from './http'
import { suggestCoverPrompt, generateCover, uploadCover, deleteCover } from './covers'

/**
 * A book's cover image. The AI can suggest a prompt and then generate the
 * art as a background task, a reader can upload one directly, and either
 * kind of cover can be removed.
 */

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
  vi.restoreAllMocks()
})

describe('suggestCoverPrompt', () => {
  it('posts to the book\'s suggest-prompt route and returns the prompt', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ prompt: 'Minimal abstract cover, punch-card motif, two colors' }),
      { status: 200 },
    ))
    const body = { provider: 'openai', model: 'gpt-image-1' } as const

    const result = await suggestCoverPrompt('ada', body)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/ada/cover/suggest-prompt')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(result).toEqual({ prompt: 'Minimal abstract cover, punch-card motif, two colors' })
  })
})

describe('generateCover', () => {
  it('posts the cover fields and returns the background task id', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-1' }), { status: 200 }))
    const body = {
      prompt: 'Minimal abstract cover, punch-card motif, two colors',
      provider: 'openai',
      model: 'gpt-image-1',
    } as const

    const result = await generateCover('ada', body)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/ada/cover/generate')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(result).toEqual({ taskId: 'task-1' })
  })

  it('rejects with the reason and status the server gave', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('{"error":"Cover generation already in progress"}', { status: 409 }),
    )
    const body = { prompt: 'A cover', provider: 'openai', model: 'gpt-image-1' } as const

    const failure = await generateCover('ada', body).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(409)
    expect((failure as Error).message).toBe('Cover generation already in progress')
  })
})

describe('uploadCover', () => {
  it('posts the image data and media type', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const body = { base64: 'aGVsbG8=', mediaType: 'image/png' } as const

    const result = await uploadCover('ada', body)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/ada/cover/upload')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(result).toEqual({ ok: true })
  })
})

describe('deleteCover', () => {
  it('sends a DELETE to the book\'s cover route', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const result = await deleteCover('ada')

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/ada/cover')
    expect((init as RequestInit).method).toBe('DELETE')
    expect((init as RequestInit).body).toBeUndefined()
    expect(result).toEqual({ ok: true })
  })
})
