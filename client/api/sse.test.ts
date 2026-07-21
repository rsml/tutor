import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiError } from './http'
import { streamGeneration, streamText, streamNdjson, subscribeToTasks } from './sse'

/**
 * The three streaming shapes this app consumes are server-sent events for
 * generation, raw text for inline chat, and newline delimited JSON for the
 * profile interview. Each has a hand rolled reader today, and these tests pin
 * the behaviour those readers have to keep, particularly around partial
 * chunks, which is where a hand rolled reader usually goes wrong.
 */

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
  vi.restoreAllMocks()
})

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

describe('streamGeneration', () => {
  it('reports every event in the stream', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse([
      'data: {"type":"stage","stage":"outline"}\n',
      'data: {"type":"chapter","text":"Once upon"}\n',
      'data: {"type":"done","chapterNum":1}\n',
    ]))
    const events: unknown[] = []

    await streamGeneration('/api/books/ada/generate-next', { method: 'POST' }, e => events.push(e))

    expect(events).toEqual([
      { type: 'stage', stage: 'outline' },
      { type: 'chapter', text: 'Once upon' },
      { type: 'done', chapterNum: 1 },
    ])
  })

  it('reassembles an event split across chunk boundaries', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(['data: {"type":"chap', 'ter","text":"hi"}\n']))
    const events: unknown[] = []

    await streamGeneration('/api/books/ada/generate-next', undefined, e => events.push(e))

    expect(events).toEqual([{ type: 'chapter', text: 'hi' }])
  })

  it('raises the reason the server gave instead of opening a stream', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('{"error":"Generation already in progress for this book"}', { status: 409 }),
    )

    const failure = await streamGeneration('/api/books/ada/generate-next', { method: 'POST' }, () => {})
      .catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(409)
    expect((failure as Error).message).toBe('Generation already in progress for this book')
  })

  it('raises when the response carries no body to read', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))

    await expect(streamGeneration('/api/books/ada/generate-next', undefined, () => {}))
      .rejects.toBeInstanceOf(ApiError)
  })
})

describe('streamText', () => {
  it('reports decoded chunks in order', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(['Mitochondria ', 'are the ', 'powerhouse.']))
    const chunks: string[] = []

    await streamText('/api/chat', { method: 'POST', body: {} }, c => chunks.push(c))

    expect(chunks).toEqual(['Mitochondria ', 'are the ', 'powerhouse.'])
  })

  it('never splits a multi-byte character across chunks', async () => {
    // The euro sign is three bytes. Arriving split, a non-streaming decoder
    // would emit a replacement character in place of it.
    const euro = new TextEncoder().encode('€')
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(euro.slice(0, 2))
        controller.enqueue(euro.slice(2))
        controller.close()
      },
    })
    fetchSpy.mockResolvedValueOnce(new Response(body))
    const chunks: string[] = []

    await streamText('/api/chat', undefined, c => chunks.push(c))

    expect(chunks.join('')).toBe('€')
  })

  it('raises the reason the server gave', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"No API key configured for openai"}', { status: 400 }))

    await expect(streamText('/api/chat', { method: 'POST' }, () => {}))
      .rejects.toThrow('No API key configured for openai')
  })
})

describe('streamNdjson', () => {
  it('reports one value per line', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse([
      '{"type":"text","content":"Hello"}\n{"type":"text","content":" there"}\n',
    ]))
    const lines: unknown[] = []

    await streamNdjson('/api/profile/interview', { method: 'POST' }, l => lines.push(l))

    expect(lines).toEqual([
      { type: 'text', content: 'Hello' },
      { type: 'text', content: ' there' },
    ])
  })

  it('reports a final value that arrived without a trailing newline', async () => {
    // The interview endpoint ends this way, and the completed profile is the
    // last value it sends, so dropping it would lose the whole result.
    fetchSpy.mockResolvedValueOnce(chunkedResponse([
      '{"type":"text","content":"done"}\n{"type":"profile_complete","profile":{"aboutMe":"x"}}',
    ]))
    const lines: unknown[] = []

    await streamNdjson('/api/profile/interview', undefined, l => lines.push(l))

    expect(lines).toHaveLength(2)
    expect(lines[1]).toEqual({ type: 'profile_complete', profile: { aboutMe: 'x' } })
  })

  it('skips a line that is not JSON and keeps reading', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(['not json\n{"type":"text","content":"ok"}\n']))
    const lines: unknown[] = []

    await streamNdjson('/api/profile/interview', undefined, l => lines.push(l))

    expect(lines).toEqual([{ type: 'text', content: 'ok' }])
  })
})

/** Stands in for the browser EventSource, which node does not provide. */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  close(): void {
    this.closed = true
  }

  static reset(): void {
    FakeEventSource.instances = []
  }

  static get latest(): FakeEventSource {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1]
  }
}

describe('subscribeToTasks', () => {
  beforeEach(() => {
    FakeEventSource.reset()
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('opens the task stream and reports each event', () => {
    const events: unknown[] = []
    subscribeToTasks(e => events.push(e))

    expect(FakeEventSource.latest.url).toContain('/api/tasks/stream')
    FakeEventSource.latest.onmessage?.({ data: '{"type":"task_progress","taskId":"t1"}' })

    expect(events).toEqual([{ type: 'task_progress', taskId: 't1' }])
  })

  it('ignores a frame that does not parse', () => {
    const events: unknown[] = []
    subscribeToTasks(e => events.push(e))

    expect(() => FakeEventSource.latest.onmessage?.({ data: '{"type":' })).not.toThrow()
    expect(events).toEqual([])
  })

  it('reopens the stream after it drops', () => {
    subscribeToTasks(() => {})
    const first = FakeEventSource.latest

    first.onerror?.()
    expect(first.closed).toBe(true)
    expect(FakeEventSource.instances).toHaveLength(1)

    vi.advanceTimersByTime(3_000)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(FakeEventSource.latest).not.toBe(first)
  })

  it('stops reconnecting once unsubscribed', () => {
    // The reader mounts and unmounts freely, so a reconnect scheduled just
    // before teardown must not resurrect the stream afterwards.
    const unsubscribe = subscribeToTasks(() => {})
    FakeEventSource.latest.onerror?.()

    unsubscribe()
    vi.advanceTimersByTime(30_000)

    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('closes the live stream on unsubscribe', () => {
    const unsubscribe = subscribeToTasks(() => {})
    unsubscribe()

    expect(FakeEventSource.latest.closed).toBe(true)
  })
})
