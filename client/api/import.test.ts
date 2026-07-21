import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiError } from './http'
import { previewEpubImport, confirmEpubImport } from './import'

/**
 * Bringing an existing EPUB into the library. The file is parsed into a
 * preview the reader can adjust, then confirmed into a finished book.
 */

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
  vi.restoreAllMocks()
})

describe('previewEpubImport', () => {
  it('posts the file and returns the parsed preview', async () => {
    const preview = { title: 'Ada Lovelace', chapterCount: 12, hasCover: true, coverBase64: 'aGVsbG8=' }
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200 }))
    const body = { base64: 'ZmFrZS1lcHVi', filename: 'ada-lovelace.epub' }

    const result = await previewEpubImport(body)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/import/preview')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(result).toEqual(preview)
  })

  it('rejects with the reason and status the server gave', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"Not a valid EPUB file"}', { status: 400 }))

    const failure = await previewEpubImport({ base64: 'bm90YW56aXA=', filename: 'not-a-book.epub' })
      .catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(400)
    expect((failure as Error).message).toBe('Not a valid EPUB file')
  })
})

describe('confirmEpubImport', () => {
  it('posts every field when tags, series and seriesOrder are all supplied', async () => {
    const book = {
      id: 'ada-lovelace',
      title: 'Ada Lovelace',
      prompt: 'Imported from EPUB',
      status: 'complete',
      totalChapters: 12,
      generatedUpTo: 12,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: ['biography'],
      audioGeneratedChapters: [],
    }
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ book }), { status: 200 }))
    const body = {
      base64: 'ZmFrZS1lcHVi',
      filename: 'ada-lovelace.epub',
      tags: ['biography'],
      series: 'Great Mathematicians',
      seriesOrder: 2,
    }

    const result = await confirmEpubImport(body)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/import/confirm')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(result).toEqual({ book })
  })

  it('omits tags, series and seriesOrder from the body when they are not supplied', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ book: {} }), { status: 200 }))
    const body = { base64: 'ZmFrZS1lcHVi', filename: 'ada-lovelace.epub' }

    await confirmEpubImport(body)

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.body).toBe(JSON.stringify({ base64: 'ZmFrZS1lcHVi', filename: 'ada-lovelace.epub' }))
    expect(init.body).not.toContain('tags')
    expect(init.body).not.toContain('series')
    expect(init.body).not.toContain('seriesOrder')
  })
})
