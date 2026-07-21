import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiError } from './http'
import {
  listBooks, getBook, updateBook, deleteBook, resetBook, rateBook,
  searchBooks, getToc, generateAllChapters, exportEpub, downloadEpub,
} from './books'

/**
 * One test per endpoint pins the method, the resolved URL, and the body this
 * module serialises, so a change to any of the three is a deliberate edit
 * here rather than a silent drift from what the server expects.
 */

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
  vi.restoreAllMocks()
})

describe('listBooks', () => {
  it('sends a GET to the library list with no trace header', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('[]', { status: 200 }))

    await listBooks()

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books')
    expect(init.method).toBeUndefined()
    expect(new Headers(init.headers).has('X-Trace-Id')).toBe(false)
  })

  it('resolves the augmented book list the server sends', async () => {
    const books = [{ id: 'ada', title: 'Ada', hasCover: true }]
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(books), { status: 200 }))

    await expect(listBooks()).resolves.toEqual(books)
  })
})

describe('getBook', () => {
  it('sends a GET to the book by id', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"id":"ada"}', { status: 200 }))

    await getBook('ada')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada')
    expect(init.method).toBeUndefined()
  })

  it('throws an ApiError carrying the server reason and status', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"Book not found"}', { status: 404 }))

    const failure = await getBook('missing').catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(404)
    expect((failure as Error).message).toBe('Book not found')
  })
})

describe('updateBook', () => {
  it('sends a PATCH with only the changed fields', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await updateBook('ada', { title: 'New Title', tags: ['math'] })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"title":"New Title","tags":["math"]}')
  })

  it('sends null to clear a nullable field such as series', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await updateBook('ada', { series: null, seriesOrder: null })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.body).toBe('{"series":null,"seriesOrder":null}')
  })
})

describe('deleteBook', () => {
  it('sends a DELETE to the book by id', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await deleteBook('ada')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada')
    expect(init.method).toBe('DELETE')
  })
})

describe('resetBook', () => {
  it('sends a POST to the reset endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await resetBook('ada')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/reset')
    expect(init.method).toBe('POST')
  })
})

describe('rateBook', () => {
  it('sends a PUT with the rating body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await rateBook('ada', { rating: 4.5, finalQuizScore: 8, finalQuizTotal: 10 })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/rating')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe('{"rating":4.5,"finalQuizScore":8,"finalQuizTotal":10}')
  })
})

describe('searchBooks', () => {
  it('sends a GET with the query and the full flag', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"results":[]}', { status: 200 }))

    await searchBooks('mitochondria', true)

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/books/search?q=mitochondria&full=true')
  })

  it('omits the full flag when a title-only search was requested', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"results":[]}', { status: 200 }))

    await searchBooks('mitochondria', false)

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/books/search?q=mitochondria')
  })
})

describe('getToc', () => {
  it('sends a GET to the table of contents endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"chapters":[]}', { status: 200 }))

    await getToc('ada')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/toc')
    expect(init.method).toBeUndefined()
  })
})

describe('generateAllChapters', () => {
  it('sends a POST with the generation settings and resolves the task id', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"taskId":"t1"}', { status: 200 }))

    const result = await generateAllChapters('ada', {
      model: 'claude-sonnet-4-6', provider: 'anthropic', quizModel: 'claude-sonnet-4-6', quizProvider: 'anthropic',
    })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/generate-all')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(
      '{"model":"claude-sonnet-4-6","provider":"anthropic","quizModel":"claude-sonnet-4-6","quizProvider":"anthropic"}',
    )
    expect(result).toEqual({ taskId: 't1' })
  })
})

describe('exportEpub', () => {
  it('sends a POST with an empty body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"cached":true,"path":"/api/books/ada/export-epub"}', { status: 200 }))

    const result = await exportEpub('ada')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/export-epub')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
    expect(result.cached).toBe(true)
  })
})

describe('downloadEpub', () => {
  it('returns the binary body rather than parsing it as JSON', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    fetchSpy.mockResolvedValueOnce(new Response(bytes, { status: 200 }))

    const blob = await downloadEpub('ada')

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/books/ada/export-epub')
    expect(blob).toBeInstanceOf(Blob)
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes)
  })

  it('throws an ApiError when no EPUB has been generated yet', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"No EPUB file, generate it first"}', { status: 404 }))

    const failure = await downloadEpub('ada').catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(404)
  })
})
