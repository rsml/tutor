import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { streamChat, type StreamChatParams } from './chat'

/**
 * streamChat is a thin wrapper over streamText that fixes the path and the
 * body shape for the inline chat endpoint, so these tests check the request
 * that gets built and that the abort signal reaches fetch, leaving chunk
 * decoding itself to sse.test.ts.
 */

/** A response whose body arrives in the given pieces rather than all at once. */
function chunkedResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body)
}

const params: StreamChatParams = {
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
  chapterContent: 'Mitochondria are complex organelles.',
  selectedText: 'Mitochondria',
  userMessage: 'Explain this more simply.',
  history: [{ role: 'user', content: 'Hi' }],
}

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
  vi.restoreAllMocks()
})

describe('streamChat', () => {
  it('posts the chat body to /api/chat', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(['ok']))

    await streamChat(params, () => {})

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/chat')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(params)
  })

  it('reports decoded chunks in order', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(['Mito', 'chondria are ', 'the powerhouse.']))
    const chunks: string[] = []

    await streamChat(params, c => chunks.push(c))

    expect(chunks).toEqual(['Mito', 'chondria are ', 'the powerhouse.'])
  })

  it('forwards the abort signal to fetch', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(['ok']))
    const controller = new AbortController()

    await streamChat({ ...params, signal: controller.signal }, () => {})

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.signal).toBe(controller.signal)
  })
})
