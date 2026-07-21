import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiError } from './http'
import {
  createBookStream,
  startFirstChapterStream,
  reviseTocStream,
  suggestTopic,
  suggestDetails,
  createSkeleton,
} from './creation'

/**
 * The creation wizard's endpoints. A topic and its details can be suggested
 * by the AI, a table of contents is generated and can be revised, and once
 * approved the first chapter is generated. An agentic caller can also ask
 * for a bare book record instead of any of that.
 */

/** A response whose body arrives in the given pieces rather than all at once. */
function chunkedResponse(chunks: string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, init)
}

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
  vi.restoreAllMocks()
})

describe('createBookStream', () => {
  it('posts the book fields and reports every event', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse([
      'data: {"type":"book_created","bookId":"ada","title":"Ada Lovelace","totalChapters":10}\n',
      'data: {"type":"toc","text":"# Ada Lovelace"}\n',
      'data: {"type":"toc_done","bookId":"ada","title":"Ada Lovelace","totalChapters":10}\n',
    ]))
    const events: unknown[] = []
    const body = {
      topic: 'Ada Lovelace',
      details: 'Focus on her collaboration with Babbage',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
      quizModel: 'claude-haiku-4',
      quizProvider: 'anthropic',
      quizLength: 3,
      chapterCount: 10,
    } as const

    await createBookStream(body, e => events.push(e))

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(events).toEqual([
      { type: 'book_created', bookId: 'ada', title: 'Ada Lovelace', totalChapters: 10 },
      { type: 'toc', text: '# Ada Lovelace' },
      { type: 'toc_done', bookId: 'ada', title: 'Ada Lovelace', totalChapters: 10 },
    ])
  })
})

describe('startFirstChapterStream', () => {
  it('posts to the book\'s start route and reports every event', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse([
      'data: {"type":"skills_classified"}\n',
      'data: {"type":"chapter","text":"Ada was born in 1815."}\n',
      'data: {"type":"done","bookId":"ada"}\n',
    ]))
    const events: unknown[] = []
    const body = {
      model: 'claude-sonnet-4',
      provider: 'anthropic',
      quizModel: 'claude-haiku-4',
      quizProvider: 'anthropic',
      quizLength: 3,
    } as const

    await startFirstChapterStream('ada', body, e => events.push(e))

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/ada/start')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(events).toEqual([
      { type: 'skills_classified' },
      { type: 'chapter', text: 'Ada was born in 1815.' },
      { type: 'done', bookId: 'ada' },
    ])
  })
})

describe('reviseTocStream', () => {
  it('posts the feedback and reports every event', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse([
      'data: {"type":"toc","text":"# Ada Lovelace, revised"}\n',
      'data: {"type":"toc_revised","bookId":"ada","title":"Ada Lovelace","totalChapters":8}\n',
    ]))
    const events: unknown[] = []
    const body = {
      feedback: 'Fewer chapters on Victorian society, more on the Analytical Engine',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
    }

    await reviseTocStream('ada', body, e => events.push(e))

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/ada/toc/revise')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(events).toEqual([
      { type: 'toc', text: '# Ada Lovelace, revised' },
      { type: 'toc_revised', bookId: 'ada', title: 'Ada Lovelace', totalChapters: 8 },
    ])
  })
})

describe('suggestTopic', () => {
  it('posts the suggestion fields and returns the topic and reasoning', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ topic: 'Kubernetes Networking', reasoning: 'Builds on the Docker book you finished' }),
      { status: 200 },
    ))
    const body = {
      model: 'claude-sonnet-4',
      provider: 'anthropic',
      mode: 'deepen',
    } as const

    const result = await suggestTopic(body)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/suggest')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(result).toEqual({ topic: 'Kubernetes Networking', reasoning: 'Builds on the Docker book you finished' })
  })

  it('rejects with the reason and status the server gave', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('{"error":"No API key configured for anthropic"}', { status: 400 }),
    )

    const failure = await suggestTopic({ model: 'claude-sonnet-4' }).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(400)
    expect((failure as Error).message).toBe('No API key configured for anthropic')
  })
})

describe('suggestDetails', () => {
  it('posts the topic and returns the elaborated details', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ details: 'Cover the punch-card era through modern container networking.' }),
      { status: 200 },
    ))
    const body = { topic: 'Kubernetes Networking', model: 'claude-sonnet-4', provider: 'anthropic' } as const

    const result = await suggestDetails(body)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/suggest-details')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(result).toEqual({ details: 'Cover the punch-card era through modern container networking.' })
  })
})

describe('createSkeleton', () => {
  it('posts the skeleton fields and returns the created book identity', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ bookId: 'ada-12345', title: 'Ada Lovelace' }),
      { status: 200 },
    ))
    const body = { title: 'Ada Lovelace', prompt: 'A biography for a curious adult reader', totalChapters: 12 }

    const result = await createSkeleton(body)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/books/create-skeleton')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify(body))
    expect(result).toEqual({ bookId: 'ada-12345', title: 'Ada Lovelace' })
  })
})
