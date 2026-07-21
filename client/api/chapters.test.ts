import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiError } from './http'
import type { GenerateChapterEvent } from '@shared/events'
import {
  getChapter, saveChapterProgress, submitChapterFeedback, getChapterQuiz, generateFinalQuiz,
  streamNextChapter, streamChapterRegeneration, streamGenerationResume,
} from './chapters'

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

/** This response's body arrives in the given pieces rather than all at once, mirroring the helper in sse.test.ts. */
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

describe('getChapter', () => {
  it('sends a GET to the chapter by number', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"content":"# Chapter One"}', { status: 200 }))

    await getChapter('ada', 1)

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/chapters/1')
    expect(init.method).toBeUndefined()
  })

  it('throws an ApiError carrying the server reason and status', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"Chapter 9 out of range (1-3)"}', { status: 400 }))

    const failure = await getChapter('ada', 9).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(400)
    expect((failure as Error).message).toBe('Chapter 9 out of range (1-3)')
  })
})

describe('saveChapterProgress', () => {
  it('sends a PUT with the scroll progress', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await saveChapterProgress('ada', 2, { scroll: 0.5, completed: false })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/progress/2')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe('{"scroll":0.5,"completed":false}')
  })
})

describe('submitChapterFeedback', () => {
  it('sends a POST with the feedback and quiz answers', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await submitChapterFeedback('ada', 2, { liked: 'the examples', disliked: '', quizAnswers: [0, 2, 1] })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/chapters/2/feedback')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"liked":"the examples","disliked":"","quizAnswers":[0,2,1]}')
  })
})

describe('getChapterQuiz', () => {
  it('sends a GET with the model, provider, and quiz length as query params', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"questions":[]}', { status: 200 }))

    await getChapterQuiz('ada', 1, { model: 'claude-sonnet-4-6', provider: 'anthropic', quizLength: 5 })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/chapters/1/quiz?model=claude-sonnet-4-6&provider=anthropic&quizLength=5')
    expect(init.method).toBeUndefined()
  })

  it('omits the quiz length when the reader has not set one', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"questions":[]}', { status: 200 }))

    await getChapterQuiz('ada', 1, { model: 'claude-sonnet-4-6', provider: 'anthropic' })

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/books/ada/chapters/1/quiz?model=claude-sonnet-4-6&provider=anthropic')
  })
})

describe('generateFinalQuiz', () => {
  it('sends a POST with the quiz model and provider', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"questions":[]}', { status: 200 }))

    await generateFinalQuiz('ada', { model: 'claude-sonnet-4-6', provider: 'anthropic' })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/final-quiz')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"model":"claude-sonnet-4-6","provider":"anthropic"}')
  })
})

describe('streamNextChapter', () => {
  it('sends a POST with the generation settings and reports every event', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse([
      'data: {"type":"chapter","text":"Once upon"}\n',
      'data: {"type":"done","chapterNum":2}\n',
    ]))
    const events: GenerateChapterEvent[] = []

    await streamNextChapter('ada', { model: 'claude-sonnet-4-6', provider: 'anthropic' }, e => events.push(e))

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/generate-next')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"model":"claude-sonnet-4-6","provider":"anthropic"}')
    expect(events).toEqual([
      { type: 'chapter', text: 'Once upon' },
      { type: 'done', chapterNum: 2 },
    ])
  })
})

describe('streamChapterRegeneration', () => {
  it('sends a POST to the chapter regenerate endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(['data: {"type":"done","chapterNum":3}\n']))
    const events: GenerateChapterEvent[] = []

    await streamChapterRegeneration('ada', 3, { model: 'claude-sonnet-4-6', provider: 'anthropic' }, e => events.push(e))

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/chapters/3/regenerate')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"model":"claude-sonnet-4-6","provider":"anthropic"}')
    expect(events).toEqual([{ type: 'done', chapterNum: 3 }])
  })
})

describe('streamGenerationResume', () => {
  it('sends a GET carrying the abort signal and reports every event', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(['data: {"type":"done","chapterNum":2}\n']))
    const controller = new AbortController()
    const events: GenerateChapterEvent[] = []

    await streamGenerationResume('ada', controller.signal, e => events.push(e))

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/books/ada/generation-stream')
    expect(init.method).toBeUndefined()
    expect(init.signal).toBe(controller.signal)
    expect(events).toEqual([{ type: 'done', chapterNum: 2 }])
  })
})
