import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiError } from './http'
import {
  getBookAudiobook,
  generateAudiobook,
  getEngineStatus,
  installEngine,
  listVoices,
  revealAudiobook,
} from './audiobook'

/**
 * The narration engine, its voices, and the audiobook generated for each
 * book. installEngine gets the most attention here, since a 409 from that
 * one endpoint is a success rather than a failure, and that is the one
 * behavior in this module that is easy to get backwards.
 */

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
})

describe('getBookAudiobook', () => {
  it('requests the per-book audiobook status', async () => {
    const payload = { exists: true, generatedChapters: [1, 2], manifest: null }
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))

    const result = await getBookAudiobook('ada')

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/ada/audiobook')
    expect((init as RequestInit).method).toBeUndefined()
    expect(result).toEqual(payload)
  })

  it('omits the trace header, since this polls on an interval while generating', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ exists: false, generatedChapters: [], manifest: null }), { status: 200 }),
    )

    await getBookAudiobook('ada')

    const headers = new Headers((fetchSpy.mock.calls[0][1] as RequestInit).headers)
    expect(headers.has('X-Trace-Id')).toBe(false)
  })
})

describe('generateAudiobook', () => {
  it('posts the voice, speed, and remember or replace choices', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 't1' }), { status: 200 }))
    const body = { voiceId: 'am_michael', speed: 1.1, rememberAsDefault: true, confirmReplace: false }

    const result = await generateAudiobook('ada', body)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/ada/audiobook')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(result).toEqual({ taskId: 't1' })
  })

  it('throws an ApiError carrying the status and the reason the server gave', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Audiobook already exists', exists: true }), { status: 409 }),
    )

    const failure = await generateAudiobook('ada', {}).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(409)
    expect((failure as Error).message).toBe('Audiobook already exists')
  })
})

describe('getEngineStatus', () => {
  it('requests the narration engine status', async () => {
    const payload = { installed: true, missing: { model: false, ffmpeg: false }, downloadSize: 0 }
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))

    const result = await getEngineStatus()

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/audiobook/status')
    expect((init as RequestInit).method).toBeUndefined()
    expect(result).toEqual(payload)
  })
})

describe('installEngine', () => {
  it('posts to the install endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 't1' }), { status: 200 }))

    await installEngine()

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/audiobook/install')
    expect((init as RequestInit).method).toBe('POST')
  })

  it('resolves rather than throwing when the engine is already installed or installing', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Audiobook engine already installed' }), { status: 409 }),
    )

    await expect(installEngine()).resolves.toBeUndefined()
  })

  it('still throws an ApiError for a real failure', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Disk full' }), { status: 500 }))

    const failure = await installEngine().catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(500)
    expect((failure as Error).message).toBe('Disk full')
  })
})

describe('listVoices', () => {
  it('requests the voice list and unwraps it', async () => {
    const voices = [
      { id: 'am_michael', name: 'Michael', language: 'American English', gender: 'Male', grade: 'A' },
    ]
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ voices }), { status: 200 }))

    const result = await listVoices()

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/audiobook/voices')
    expect((init as RequestInit).method).toBeUndefined()
    expect(result).toEqual(voices)
  })
})

describe('revealAudiobook', () => {
  it('posts to the reveal endpoint for one book', async () => {
    const payload = { path: '/books/ada/audiobook/book.m4b', revealed: true }
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))

    const result = await revealAudiobook('ada')

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/ada/audiobook/reveal')
    expect((init as RequestInit).method).toBe('POST')
    expect(result).toEqual(payload)
  })
})
